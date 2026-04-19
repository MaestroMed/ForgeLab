"""Auto-Compilation Service for generating best-of videos."""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Optional

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class CompilationClip:
    """A clip selected for compilation."""
    segment_id: str
    start_time: float
    end_time: float
    duration: float
    score: float
    tags: list[str]
    transition: str = "cut"  # cut, crossfade, zoom


@dataclass
class CompilationConfig:
    """Configuration for compilation generation."""
    target_duration: float = 180  # 3 minutes
    max_clips: int = 20
    min_clip_duration: float = 5
    max_clip_duration: float = 30
    transition_style: str = "cut"  # cut, crossfade, mix
    include_intro: bool = True
    include_outro: bool = True
    music_track: str | None = None
    music_volume: float = 0.2
    sort_by: str = "score"  # score, chronological, random


@dataclass
class CompilationResult:
    """Result of compilation generation."""
    clips: list[CompilationClip]
    total_duration: float
    output_path: str | None = None
    status: str = "pending"


class CompilationService:
    """
    Service for automatically generating best-of compilations.

    Selects top clips and arranges them into a cohesive video.
    """

    _instance: Optional["CompilationService"] = None

    def __init__(self):
        self._ffmpeg = None

    @classmethod
    def get_instance(cls) -> "CompilationService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_ffmpeg(self):
        """Get FFmpeg service."""
        if self._ffmpeg is None:
            from forge_engine.services.ffmpeg import FFmpegService
            self._ffmpeg = FFmpegService.get_instance()
        return self._ffmpeg

    async def select_clips(
        self,
        segments: list[dict[str, Any]],
        config: CompilationConfig
    ) -> list[CompilationClip]:
        """
        Select best clips for compilation.

        Args:
            segments: List of available segments with scores
            config: Compilation configuration

        Returns:
            List of selected clips
        """
        if not segments:
            return []

        # Filter by duration
        valid_segments = [
            s for s in segments
            if config.min_clip_duration <= s.get("duration", 0) <= config.max_clip_duration
        ]

        # Sort by score
        if config.sort_by == "score":
            valid_segments.sort(
                key=lambda s: s.get("score", {}).get("total", 0),
                reverse=True
            )
        elif config.sort_by == "chronological":
            valid_segments.sort(key=lambda s: s.get("start_time", 0))
        elif config.sort_by == "random":
            import random
            random.shuffle(valid_segments)

        # Select clips until we hit target duration
        selected: list[CompilationClip] = []
        total_duration = 0

        for segment in valid_segments:
            if len(selected) >= config.max_clips:
                break

            duration = segment.get("duration", 0)
            if total_duration + duration > config.target_duration:
                continue

            # Check for overlap with existing clips
            start = segment.get("start_time", 0)
            end = segment.get("end_time", 0)

            overlaps = False
            for existing in selected:
                if (start < existing.end_time and end > existing.start_time):
                    overlaps = True
                    break

            if overlaps:
                continue

            score_data = segment.get("score", {})

            clip = CompilationClip(
                segment_id=segment.get("id", ""),
                start_time=start,
                end_time=end,
                duration=duration,
                score=score_data.get("total", 0),
                tags=score_data.get("tags", []),
                transition=config.transition_style
            )

            selected.append(clip)
            total_duration += duration

        # Sort chronologically for final arrangement
        selected.sort(key=lambda c: c.start_time)

        logger.info(f"Selected {len(selected)} clips for compilation ({total_duration:.1f}s)")

        return selected

    async def generate_compilation(
        self,
        project_id: str,
        source_video: str,
        clips: list[CompilationClip],
        config: CompilationConfig,
        output_path: str | None = None,
        progress_callback: Callable[[float, str], None] | None = None
    ) -> CompilationResult:
        """
        Generate a compilation video from selected clips.

        Args:
            project_id: Project ID
            source_video: Path to source video
            clips: Selected clips
            config: Compilation configuration
            output_path: Output path (auto-generated if None)
            progress_callback: Progress callback (percent, message)

        Returns:
            CompilationResult with output path
        """
        if not clips:
            return CompilationResult(
                clips=[],
                total_duration=0,
                status="error"
            )

        if output_path is None:
            project_dir = settings.LIBRARY_PATH / "projects" / project_id / "exports"
            project_dir.mkdir(parents=True, exist_ok=True)
            output_path = str(project_dir / "compilation.mp4")

        ffmpeg = self._get_ffmpeg()

        if progress_callback:
            progress_callback(5, "Préparation de la compilation...")

        # Build FFmpeg filter complex for concatenation
        total_duration = sum(c.duration for c in clips)

        # Create concat demuxer file
        concat_list = []
        for i, clip in enumerate(clips):
            concat_list.append({
                "start": clip.start_time,
                "end": clip.end_time,
                "transition": clip.transition
            })

        if progress_callback:
            progress_callback(10, "Extraction des clips...")

        # Extract and concatenate clips
        # For now, use a simple filter complex approach
        filter_parts = []
        input_streams = []

        for i, clip in enumerate(clips):
            # Trim each clip
            filter_parts.append(
                f"[0:v]trim=start={clip.start_time}:end={clip.end_time},"
                f"setpts=PTS-STARTPTS[v{i}]"
            )
            filter_parts.append(
                f"[0:a]atrim=start={clip.start_time}:end={clip.end_time},"
                f"asetpts=PTS-STARTPTS[a{i}]"
            )
            input_streams.append(f"[v{i}][a{i}]")

        # Concatenate
        filter_parts.append(
            f"{''.join(input_streams)}concat=n={len(clips)}:v=1:a=1[outv][outa]"
        )

        filter_complex = ";".join(filter_parts)

        if progress_callback:
            progress_callback(20, "Rendu de la compilation...")

        # Run FFmpeg
        cmd = [
            str(ffmpeg.ffmpeg_path),
            "-i", source_video,
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-y",
            output_path
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"Compilation failed: {stderr.decode(errors='replace')[:500]}")
            return CompilationResult(
                clips=clips,
                total_duration=total_duration,
                status="error"
            )

        if progress_callback:
            progress_callback(100, "Compilation terminée!")

        return CompilationResult(
            clips=clips,
            total_duration=total_duration,
            output_path=output_path,
            status="completed"
        )

    async def suggest_compilation(
        self,
        segments: list[dict[str, Any]],
        style: str = "highlights"
    ) -> CompilationConfig:
        """
        Suggest compilation configuration based on content.

        Args:
            segments: Available segments
            style: Compilation style (highlights, story, funny, intense)

        Returns:
            Suggested CompilationConfig
        """
        # Analyze segment distribution
        sum(s.get("duration", 0) for s in segments)
        sum(s.get("score", {}).get("total", 0) for s in segments) / len(segments) if segments else 0

        # Collect all tags
        all_tags = []
        for s in segments:
            all_tags.extend(s.get("score", {}).get("tags", []))

        # Count tag frequencies
        tag_counts = {}
        for tag in all_tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

        # Determine dominant content type

        # Configure based on style
        if style == "highlights":
            return CompilationConfig(
                target_duration=180,
                max_clips=15,
                min_clip_duration=5,
                max_clip_duration=20,
                transition_style="cut",
                sort_by="score"
            )

        elif style == "funny":
            return CompilationConfig(
                target_duration=120,
                max_clips=10,
                min_clip_duration=5,
                max_clip_duration=15,
                transition_style="cut",
                sort_by="score"  # Will filter by humor tag
            )

        elif style == "intense":
            return CompilationConfig(
                target_duration=90,
                max_clips=8,
                min_clip_duration=8,
                max_clip_duration=20,
                transition_style="crossfade",
                sort_by="score"
            )

        else:  # story - chronological
            return CompilationConfig(
                target_duration=300,
                max_clips=20,
                min_clip_duration=10,
                max_clip_duration=30,
                transition_style="crossfade",
                sort_by="chronological"
            )


# Convenience functions
def get_compilation_service() -> CompilationService:
    """Get the compilation service instance."""
    return CompilationService.get_instance()
