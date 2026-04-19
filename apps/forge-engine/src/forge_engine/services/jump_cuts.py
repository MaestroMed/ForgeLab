"""Jump Cut Engine for automatic silence removal and dynamic editing.

This service analyzes audio to detect speech segments and generates
a list of "keep ranges" that can be used to apply jump cuts during export.

Features:
- Silence detection using Silero VAD
- Configurable sensitivity (light, normal, aggressive)
- Multiple transition styles (hard cut, zoom, crossfade)
- FFmpeg integration for seamless video concatenation
"""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from forge_engine.services.ffmpeg import FFmpegService
from forge_engine.services.vad_prefilter import VADPrefilterService

logger = logging.getLogger(__name__)


class TransitionStyle(Enum):
    """Transition style between jump cuts."""
    HARD = "hard"           # Straight cut, no transition
    ZOOM = "zoom"           # Slight zoom (2-3%) to mask the cut
    CROSSFADE = "crossfade" # Short audio/video crossfade


class Sensitivity(Enum):
    """Jump cut sensitivity presets."""
    LIGHT = "light"         # Only remove long pauses (600ms+)
    NORMAL = "normal"       # Standard (400ms+)
    AGGRESSIVE = "aggressive"  # Remove short pauses too (250ms+)


@dataclass
class JumpCutConfig:
    """Configuration for jump cut processing."""
    enabled: bool = False
    sensitivity: Sensitivity = Sensitivity.NORMAL
    min_silence_ms: int = 400       # Minimum silence duration to cut (ms)
    padding_ms: int = 50            # Padding to keep before/after speech (ms)
    transition: TransitionStyle = TransitionStyle.HARD
    zoom_percent: float = 1.03      # Zoom factor for ZOOM transition
    crossfade_ms: int = 80          # Crossfade duration for CROSSFADE transition
    min_segment_ms: int = 200       # Minimum segment length to keep (ms)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JumpCutConfig":
        """Create config from dictionary."""
        if not data:
            return cls()

        # Map sensitivity string to enum
        sensitivity_map = {
            "light": Sensitivity.LIGHT,
            "normal": Sensitivity.NORMAL,
            "aggressive": Sensitivity.AGGRESSIVE,
        }
        sensitivity = sensitivity_map.get(
            data.get("sensitivity", "normal"),
            Sensitivity.NORMAL
        )

        # Map transition string to enum
        transition_map = {
            "hard": TransitionStyle.HARD,
            "zoom": TransitionStyle.ZOOM,
            "crossfade": TransitionStyle.CROSSFADE,
        }
        transition = transition_map.get(
            data.get("transition", "hard"),
            TransitionStyle.HARD
        )

        # Adjust min_silence based on sensitivity
        sensitivity_thresholds = {
            Sensitivity.LIGHT: 600,
            Sensitivity.NORMAL: 400,
            Sensitivity.AGGRESSIVE: 250,
        }
        min_silence = data.get("min_silence_ms") or sensitivity_thresholds[sensitivity]

        return cls(
            enabled=data.get("enabled", False),
            sensitivity=sensitivity,
            min_silence_ms=min_silence,
            padding_ms=data.get("padding_ms", 50),
            transition=transition,
            zoom_percent=data.get("zoom_percent", 1.03),
            crossfade_ms=data.get("crossfade_ms", 80),
            min_segment_ms=data.get("min_segment_ms", 200),
        )


@dataclass
class KeepRange:
    """A range of video to keep (speech detected)."""
    start: float  # Start time in seconds (relative to segment)
    end: float    # End time in seconds (relative to segment)

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class JumpCutAnalysis:
    """Result of jump cut analysis."""
    keep_ranges: list[KeepRange]
    original_duration: float
    new_duration: float
    cuts_count: int
    time_saved: float
    time_saved_percent: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "keep_ranges": [{"start": r.start, "end": r.end} for r in self.keep_ranges],
            "original_duration": self.original_duration,
            "new_duration": self.new_duration,
            "cuts_count": self.cuts_count,
            "time_saved": self.time_saved,
            "time_saved_percent": self.time_saved_percent,
        }


class JumpCutEngine:
    """Engine for automatic jump cut detection and application.

    Uses Silero VAD for speech detection and FFmpeg for video processing.
    """

    _instance: Optional["JumpCutEngine"] = None

    def __init__(self):
        self.vad = VADPrefilterService.get_instance()
        self.ffmpeg = FFmpegService.get_instance()

    @classmethod
    def get_instance(cls) -> "JumpCutEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def analyze_segment(
        self,
        audio_path: str,
        start_time: float,
        duration: float,
        config: JumpCutConfig,
        progress_callback: Callable[[float], None] | None = None
    ) -> JumpCutAnalysis:
        """Analyze a segment to detect speech and generate keep ranges.

        Args:
            audio_path: Path to the audio file (full video or extracted audio)
            start_time: Start time of the segment in the source
            duration: Duration of the segment
            config: Jump cut configuration
            progress_callback: Optional progress callback (0-100)

        Returns:
            JumpCutAnalysis with keep ranges and statistics
        """
        if not self.vad.is_available():
            logger.warning("VAD not available, returning full segment as single range")
            return JumpCutAnalysis(
                keep_ranges=[KeepRange(0, duration)],
                original_duration=duration,
                new_duration=duration,
                cuts_count=0,
                time_saved=0,
                time_saved_percent=0,
            )

        if progress_callback:
            progress_callback(10)

        # Extract audio segment for VAD analysis
        temp_audio = Path(audio_path).parent / f"temp_vad_{start_time:.0f}.wav"

        try:
            # Extract segment audio
            await self._extract_segment_audio(
                audio_path, str(temp_audio), start_time, duration
            )

            if progress_callback:
                progress_callback(30)

            # Run VAD on the segment
            vad_result = await self.vad.prefilter_audio(
                audio_path=str(temp_audio),
                threshold=0.5,
                min_speech_duration_ms=config.min_segment_ms,
                min_silence_duration_ms=config.min_silence_ms,
                padding_ms=config.padding_ms,
                merge_threshold_ms=100,  # Merge close segments
            )

            if progress_callback:
                progress_callback(80)

            # Convert VAD segments to keep ranges
            keep_ranges = []
            for seg in vad_result.segments:
                # Clamp to segment bounds
                start = max(0, seg.start)
                end = min(duration, seg.end)
                if end > start and (end - start) >= config.min_segment_ms / 1000:
                    keep_ranges.append(KeepRange(start=start, end=end))

            # If no ranges found, keep entire segment
            if not keep_ranges:
                keep_ranges = [KeepRange(0, duration)]

            # Calculate statistics
            new_duration = sum(r.duration for r in keep_ranges)
            time_saved = duration - new_duration
            cuts_count = len(keep_ranges) - 1 if len(keep_ranges) > 1 else 0

            if progress_callback:
                progress_callback(100)

            logger.info(
                f"[JumpCut] Analyzed {duration:.1f}s segment: "
                f"{len(keep_ranges)} ranges, {cuts_count} cuts, "
                f"{time_saved:.1f}s saved ({time_saved/duration*100:.0f}%)"
            )

            return JumpCutAnalysis(
                keep_ranges=keep_ranges,
                original_duration=duration,
                new_duration=new_duration,
                cuts_count=cuts_count,
                time_saved=time_saved,
                time_saved_percent=(time_saved / duration * 100) if duration > 0 else 0,
            )

        finally:
            # Cleanup temp file
            try:
                if temp_audio.exists():
                    temp_audio.unlink()
            except Exception as e:
                logger.warning(f"Could not delete temp audio: {e}")

    async def _extract_segment_audio(
        self,
        source_path: str,
        output_path: str,
        start_time: float,
        duration: float
    ):
        """Extract audio segment for VAD analysis."""
        cmd = [
            self.ffmpeg.ffmpeg_path,
            "-y",
            "-ss", str(start_time),
            "-i", source_path,
            "-t", str(duration),
            "-vn",  # No video
            "-acodec", "pcm_s16le",
            "-ar", "16000",  # 16kHz for VAD
            "-ac", "1",  # Mono
            output_path
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        await proc.wait()

        if proc.returncode != 0:
            raise RuntimeError("Failed to extract audio segment for VAD")

    async def apply_jump_cuts(
        self,
        source_path: str,
        output_path: str,
        segment_start: float,
        keep_ranges: list[KeepRange],
        config: JumpCutConfig,
        video_filters: list[str] | None = None,
        progress_callback: Callable[[float], None] | None = None
    ) -> dict[str, Any]:
        """Apply jump cuts to a video segment using FFmpeg.

        Args:
            source_path: Path to source video
            output_path: Path for output video
            segment_start: Start time of segment in source
            keep_ranges: List of ranges to keep (relative to segment start)
            config: Jump cut configuration
            video_filters: Additional video filters to apply
            progress_callback: Optional progress callback

        Returns:
            Result dict with output path and stats
        """
        if not keep_ranges:
            raise ValueError("No keep ranges provided")

        # If only one range and it's the full segment, just copy
        if len(keep_ranges) == 1:
            return await self._render_single_range(
                source_path, output_path, segment_start,
                keep_ranges[0], video_filters, progress_callback
            )

        # Multiple ranges - use concat approach
        if config.transition == TransitionStyle.HARD:
            return await self._render_hard_cuts(
                source_path, output_path, segment_start,
                keep_ranges, video_filters, progress_callback
            )
        elif config.transition == TransitionStyle.ZOOM:
            return await self._render_zoom_cuts(
                source_path, output_path, segment_start,
                keep_ranges, config.zoom_percent, video_filters, progress_callback
            )
        else:  # CROSSFADE
            return await self._render_crossfade_cuts(
                source_path, output_path, segment_start,
                keep_ranges, config.crossfade_ms, video_filters, progress_callback
            )

    async def _render_single_range(
        self,
        source_path: str,
        output_path: str,
        segment_start: float,
        range: KeepRange,
        video_filters: list[str] | None,
        progress_callback: Callable[[float], None] | None
    ) -> dict[str, Any]:
        """Render a single range (no cuts needed)."""
        start = segment_start + range.start

        filter_str = ",".join(video_filters) if video_filters else None

        cmd = [
            self.ffmpeg.ffmpeg_path,
            "-y",
            "-ss", str(start),
            "-i", source_path,
            "-t", str(range.duration),
        ]

        if filter_str:
            cmd.extend(["-vf", filter_str])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE
        )

        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Single range render failed: {stderr.decode()[:500]}")

        if progress_callback:
            progress_callback(100)

        return {"output_path": output_path, "cuts_applied": 0}

    async def _render_hard_cuts(
        self,
        source_path: str,
        output_path: str,
        segment_start: float,
        keep_ranges: list[KeepRange],
        video_filters: list[str] | None,
        progress_callback: Callable[[float], None] | None
    ) -> dict[str, Any]:
        """Render with hard cuts using FFmpeg concat filter."""
        Path(output_path).parent

        # Build complex filter for concatenation
        # Each range becomes a separate stream that we trim and concat
        filter_parts = []
        concat_inputs = []

        for i, r in enumerate(keep_ranges):
            abs_start = segment_start + r.start
            # Trim video and audio for this range
            filter_parts.append(
                f"[0:v]trim=start={abs_start}:duration={r.duration},setpts=PTS-STARTPTS[v{i}]"
            )
            filter_parts.append(
                f"[0:a]atrim=start={abs_start}:duration={r.duration},asetpts=PTS-STARTPTS[a{i}]"
            )
            concat_inputs.append(f"[v{i}][a{i}]")

        # Concat all ranges
        n = len(keep_ranges)
        filter_parts.append(
            f"{''.join(concat_inputs)}concat=n={n}:v=1:a=1[outv][outa]"
        )

        # Add video filters if provided
        if video_filters:
            filter_parts.append(f"[outv]{','.join(video_filters)}[finalv]")
            final_video = "[finalv]"
        else:
            final_video = "[outv]"

        filter_complex = ";".join(filter_parts)

        cmd = [
            self.ffmpeg.ffmpeg_path,
            "-y",
            "-i", source_path,
            "-filter_complex", filter_complex,
            "-map", final_video,
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ]

        logger.info(f"[JumpCut] Rendering {len(keep_ranges)} ranges with hard cuts")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"[JumpCut] FFmpeg failed: {stderr.decode()[:1000]}")
            raise RuntimeError(f"Jump cut render failed: {stderr.decode()[:500]}")

        if progress_callback:
            progress_callback(100)

        return {
            "output_path": output_path,
            "cuts_applied": len(keep_ranges) - 1
        }

    async def _render_zoom_cuts(
        self,
        source_path: str,
        output_path: str,
        segment_start: float,
        keep_ranges: list[KeepRange],
        zoom_percent: float,
        video_filters: list[str] | None,
        progress_callback: Callable[[float], None] | None
    ) -> dict[str, Any]:
        """Render with subtle zoom alternation to mask jump cuts.

        Alternates between normal and slightly zoomed-in frames at each cut
        point, creating a visual break that makes the cut feel intentional.
        """
        Path(output_path).parent

        filter_parts = []
        concat_inputs = []

        for i, r in enumerate(keep_ranges):
            abs_start = segment_start + r.start
            # Alternate zoom: even segments normal, odd segments zoomed
            if i % 2 == 1:
                # Zoomed segment: scale up then crop back to original size
                scale_factor = zoom_percent
                filter_parts.append(
                    f"[0:v]trim=start={abs_start}:duration={r.duration},setpts=PTS-STARTPTS,"
                    f"scale=iw*{scale_factor}:ih*{scale_factor},"
                    f"crop=iw/{scale_factor}:ih/{scale_factor}[v{i}]"
                )
            else:
                filter_parts.append(
                    f"[0:v]trim=start={abs_start}:duration={r.duration},setpts=PTS-STARTPTS[v{i}]"
                )
            filter_parts.append(
                f"[0:a]atrim=start={abs_start}:duration={r.duration},asetpts=PTS-STARTPTS[a{i}]"
            )
            concat_inputs.append(f"[v{i}][a{i}]")

        n = len(keep_ranges)
        filter_parts.append(
            f"{''.join(concat_inputs)}concat=n={n}:v=1:a=1[outv][outa]"
        )

        if video_filters:
            filter_parts.append(f"[outv]{','.join(video_filters)}[finalv]")
            final_video = "[finalv]"
        else:
            final_video = "[outv]"

        filter_complex = ";".join(filter_parts)

        cmd = [
            self.ffmpeg.ffmpeg_path,
            "-y",
            "-i", source_path,
            "-filter_complex", filter_complex,
            "-map", final_video,
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ]

        logger.info(f"[JumpCut] Rendering {len(keep_ranges)} ranges with zoom cuts (zoom={zoom_percent})")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"[JumpCut] Zoom cuts FFmpeg failed: {stderr.decode()[:1000]}")
            # Fallback to hard cuts if zoom fails
            logger.warning("[JumpCut] Falling back to hard cuts")
            return await self._render_hard_cuts(
                source_path, output_path, segment_start,
                keep_ranges, video_filters, progress_callback
            )

        if progress_callback:
            progress_callback(100)

        return {
            "output_path": output_path,
            "cuts_applied": len(keep_ranges) - 1,
            "transition": "zoom"
        }

    async def _render_crossfade_cuts(
        self,
        source_path: str,
        output_path: str,
        segment_start: float,
        keep_ranges: list[KeepRange],
        crossfade_ms: int,
        video_filters: list[str] | None,
        progress_callback: Callable[[float], None] | None
    ) -> dict[str, Any]:
        """Render with short audio crossfade between cuts.

        Uses acrossfade on audio to smooth the transitions while keeping
        hard video cuts. This removes audio pops/clicks at cut points.
        """
        crossfade_s = crossfade_ms / 1000.0

        # For crossfade, we need at least 2 ranges with sufficient duration
        valid_ranges = [r for r in keep_ranges if r.duration > crossfade_s * 2]
        if len(valid_ranges) < 2:
            logger.info("[JumpCut] Not enough valid ranges for crossfade, using hard cuts")
            return await self._render_hard_cuts(
                source_path, output_path, segment_start,
                keep_ranges, video_filters, progress_callback
            )

        # Build filter: trim each range, concat video with hard cuts,
        # but apply acrossfade on audio pairs
        filter_parts = []

        # First, trim all ranges
        for i, r in enumerate(valid_ranges):
            abs_start = segment_start + r.start
            filter_parts.append(
                f"[0:v]trim=start={abs_start}:duration={r.duration},setpts=PTS-STARTPTS[v{i}]"
            )
            filter_parts.append(
                f"[0:a]atrim=start={abs_start}:duration={r.duration},asetpts=PTS-STARTPTS[a{i}]"
            )

        # Concat video (hard cuts)
        n = len(valid_ranges)
        video_concat = "".join(f"[v{i}]" for i in range(n))
        filter_parts.append(f"{video_concat}concat=n={n}:v=1:a=0[outv]")

        # Chain audio crossfades: a0 x a1 -> tmp0, tmp0 x a2 -> tmp1, etc.
        if n == 2:
            filter_parts.append(
                f"[a0][a1]acrossfade=d={crossfade_s}:c1=tri:c2=tri[outa]"
            )
        else:
            # Chain crossfades
            filter_parts.append(
                f"[a0][a1]acrossfade=d={crossfade_s}:c1=tri:c2=tri[atmp0]"
            )
            for i in range(2, n):
                prev = f"[atmp{i-2}]"
                curr = f"[a{i}]"
                if i == n - 1:
                    out = "[outa]"
                else:
                    out = f"[atmp{i-1}]"
                filter_parts.append(
                    f"{prev}{curr}acrossfade=d={crossfade_s}:c1=tri:c2=tri{out}"
                )

        if video_filters:
            filter_parts.append(f"[outv]{','.join(video_filters)}[finalv]")
            final_video = "[finalv]"
        else:
            final_video = "[outv]"

        filter_complex = ";".join(filter_parts)

        cmd = [
            self.ffmpeg.ffmpeg_path,
            "-y",
            "-i", source_path,
            "-filter_complex", filter_complex,
            "-map", final_video,
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ]

        logger.info(f"[JumpCut] Rendering {len(valid_ranges)} ranges with crossfade ({crossfade_ms}ms)")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"[JumpCut] Crossfade FFmpeg failed: {stderr.decode()[:1000]}")
            logger.warning("[JumpCut] Falling back to hard cuts")
            return await self._render_hard_cuts(
                source_path, output_path, segment_start,
                keep_ranges, video_filters, progress_callback
            )

        if progress_callback:
            progress_callback(100)

        return {
            "output_path": output_path,
            "cuts_applied": len(valid_ranges) - 1,
            "transition": "crossfade"
        }

    def generate_ffmpeg_ranges(
        self,
        segment_start: float,
        keep_ranges: list[KeepRange]
    ) -> list[tuple[float, float]]:
        """Generate absolute time ranges for FFmpeg.

        Returns list of (start, end) tuples in absolute source time.
        """
        return [
            (segment_start + r.start, segment_start + r.end)
            for r in keep_ranges
        ]
