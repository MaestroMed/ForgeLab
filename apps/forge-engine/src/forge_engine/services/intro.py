"""Intro generation engine for video clips."""

import asyncio
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from forge_engine.core.config import settings
from forge_engine.core.fonts import resolve_font_ffmpeg
from forge_engine.services.ffmpeg import FFmpegService

logger = logging.getLogger(__name__)


class IntroEngine:
    """Service for generating video intro sequences with blur, title and badge."""

    def __init__(self):
        self.ffmpeg = FFmpegService.get_instance()
        self.output_width = settings.OUTPUT_WIDTH
        self.output_height = settings.OUTPUT_HEIGHT

    async def render_intro(
        self,
        source_path: str,
        output_path: str,
        start_time: float,
        duration: float,
        config: dict[str, Any],
        progress_callback: Callable[[float], None] | None = None
    ) -> dict[str, Any]:
        """
        Render an intro clip with blurred background, title and badge.

        Args:
            source_path: Path to source video
            output_path: Path to output intro clip
            start_time: Start time in source video (to extract background frame)
            duration: Duration of intro in seconds
            config: Intro configuration with:
                - title: Title text to display
                - badgeText: Badge text (e.g., @username)
                - backgroundBlur: Blur intensity (0-30)
                - titleFont: Font family for title
                - titleSize: Font size for title
                - titleColor: Hex color for title
                - badgeColor: Hex color for badge
                - animation: Animation type (fade, slide, zoom, bounce)
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Extract config values
        title = config.get("title", "")
        badge_text = config.get("badgeText", "")
        blur = config.get("backgroundBlur", 15)
        title_font = config.get("titleFont", "Montserrat")
        title_size = config.get("titleSize", 72)
        title_color = self._hex_to_ffmpeg_color(config.get("titleColor", "#FFFFFF"))
        badge_color = self._hex_to_ffmpeg_color(config.get("badgeColor", "#00FF88"))
        animation = config.get("animation", "fade")

        # Build filter complex for intro
        # 1. Extract a single frame at start_time
        # 2. Apply blur
        # 3. Scale to output size
        # 4. Loop for duration
        # 5. Overlay text with animation

        # Calculate positions
        title_y = int(self.output_height * 0.45)  # 45% from top
        badge_y = int(self.output_height * 0.55)  # 55% from top

        # Animation timing
        fade_in = 0.5
        fade_out = 0.3

        # Build filter chain
        filters = []

        # Background: extract frame, scale, blur, loop
        filters.append(
            f"[0:v]select='eq(n\\,0)',setpts=N/FRAME_RATE/TB,"
            f"scale={self.output_width}:{self.output_height}:force_original_aspect_ratio=increase,"
            f"crop={self.output_width}:{self.output_height},"
            f"boxblur={blur}:{blur},"
            f"loop=loop={int(duration * 30)}:size=1:start=0,"
            f"setpts=N/30/TB[bg]"
        )

        # Title text with animation
        title_escaped = title.replace("'", "\\'").replace(":", "\\:")
        title_filter = self._build_text_filter(
            text=title_escaped,
            font=title_font,
            size=title_size,
            color=title_color,
            x="(w-text_w)/2",
            y=str(title_y),
            animation=animation,
            duration=duration,
            fade_in=fade_in,
            layer_name="title"
        )
        filters.append(f"[bg]{title_filter}[withtitle]")

        # Badge text
        if badge_text:
            badge_escaped = badge_text.replace("'", "\\'").replace(":", "\\:")
            badge_filter = self._build_text_filter(
                text=badge_escaped,
                font=title_font,
                size=int(title_size * 0.5),
                color=badge_color,
                x="(w-text_w)/2",
                y=str(badge_y),
                animation=animation,
                duration=duration,
                fade_in=fade_in + 0.2,  # Slightly delayed
                layer_name="badge"
            )
            filters.append(f"[withtitle]{badge_filter}[final]")
            final_output = "[final]"
        else:
            final_output = "[withtitle]"

        # Add fade out at the end
        filters.append(
            f"{final_output}fade=t=out:st={duration - fade_out}:d={fade_out}[out]"
        )

        filter_complex = ";".join(filters)

        # Build FFmpeg command
        cmd = [
            str(self.ffmpeg.ffmpeg_path),
            "-ss", str(start_time),
            "-i", source_path,
            "-t", str(duration),
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            "-y",
            str(output_path)
        ]

        logger.info(f"Rendering intro: {' '.join(cmd)}")

        # Run FFmpeg
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )

        await proc.wait()

        if proc.returncode != 0:
            logger.error(f"Intro rendering failed with code {proc.returncode}")
            raise RuntimeError("Intro rendering failed")

        if progress_callback:
            progress_callback(100.0)

        return {
            "output_path": str(output_path),
            "duration": duration,
        }

    def _build_text_filter(
        self,
        text: str,
        font: str,
        size: int,
        color: str,
        x: str,
        y: str,
        animation: str,
        duration: float,
        fade_in: float,
        layer_name: str
    ) -> str:
        """Build drawtext filter with animation."""

        # Base drawtext parameters
        base_params = [
            f"text='{text}'",
            f"fontfile={resolve_font_ffmpeg(font)}",
            f"fontsize={size}",
            f"fontcolor={color}",
            f"x={x}",
            f"y={y}",
            "shadowcolor=black@0.5",
            "shadowx=3",
            "shadowy=3",
        ]

        # Add animation based on type
        if animation == "fade":
            # Simple fade in
            base_params.append(f"alpha='if(lt(t,{fade_in}),t/{fade_in},1)'")
        elif animation == "slide":
            # Slide up from below
            base_params[-2] = f"y={y}+50*(1-min(t/{fade_in},1))"
            base_params.append(f"alpha='if(lt(t,{fade_in}),t/{fade_in},1)'")
        elif animation == "zoom":
            # Zoom in effect via fontsize (simplified)
            base_params.append(f"alpha='if(lt(t,{fade_in}),t/{fade_in},1)'")
        elif animation == "bounce":
            # Bounce effect
            bounce_expr = f"if(lt(t,{fade_in}),{y}+30*sin(t*10)*pow(0.5,t*5),{y})"
            base_params[-2] = f"y={bounce_expr}"
            base_params.append(f"alpha='if(lt(t,{fade_in}),t/{fade_in},1)'")
        else:
            base_params.append(f"alpha='if(lt(t,{fade_in}),t/{fade_in},1)'")

        return f"drawtext={':'.join(base_params)}"

    def _hex_to_ffmpeg_color(self, hex_color: str) -> str:
        """Convert hex color to FFmpeg format (0xRRGGBB or color name)."""
        if not hex_color:
            return "white"

        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            return f"0x{hex_color}"
        return "white"

    async def concat_intro_with_clip(
        self,
        intro_path: str,
        clip_path: str,
        output_path: str,
        progress_callback: Callable[[float], None] | None = None
    ) -> dict[str, Any]:
        """Concatenate intro with main clip (deprecated - use apply_intro_overlay instead)."""
        output_path = Path(output_path)

        # Create concat file
        concat_file = output_path.parent / f"{output_path.stem}_concat.txt"
        with open(concat_file, "w") as f:
            f.write(f"file '{intro_path}'\n")
            f.write(f"file '{clip_path}'\n")

        cmd = [
            str(self.ffmpeg.ffmpeg_path),
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            "-y",
            str(output_path)
        ]

        logger.info(f"Concatenating intro + clip: {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )

        await proc.wait()

        # Cleanup concat file
        try:
            concat_file.unlink()
        except Exception:
            pass

        if proc.returncode != 0:
            raise RuntimeError("Concat failed")

        if progress_callback:
            progress_callback(100.0)

        return {
            "output_path": str(output_path),
        }

    async def apply_intro_overlay(
        self,
        clip_path: str,
        output_path: str,
        config: dict[str, Any],
        progress_callback: Callable[[float], None] | None = None
    ) -> dict[str, Any]:
        """
        Apply intro as overlay on the beginning of an existing clip.

        The video plays from the start while the intro overlay fades out.
        Audio is preserved throughout.

        Args:
            clip_path: Path to the already-rendered clip
            output_path: Path to save the final video with intro
            config: Intro configuration with:
                - duration: How long the intro overlay lasts
                - title: Title text
                - badgeText: Badge text
                - backgroundBlur: Blur intensity for the intro section
                - titleFont, titleSize, titleColor, badgeColor, animation
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Extract config values
        intro_duration = config.get("duration", 2.5)
        title = config.get("title", "")
        badge_text = config.get("badgeText", "")
        blur = config.get("backgroundBlur", 15)
        title_font = config.get("titleFont", "Montserrat")
        title_size = config.get("titleSize", 72)
        title_color = self._hex_to_ffmpeg_color(config.get("titleColor", "#FFFFFF"))
        badge_color = self._hex_to_ffmpeg_color(config.get("badgeColor", "#00FF88"))
        animation = config.get("animation", "fade")

        # Calculate positions
        title_y = int(self.output_height * 0.42)
        badge_y = int(self.output_height * 0.52)

        # Animation timing
        fade_in = 0.4
        fade_out = 0.5

        # Build filter complex:
        # 1. Split video into two streams
        # 2. Apply blur to one stream for intro duration, then blend to clean
        # 3. Overlay text on top
        # 4. Keep audio unchanged
        #
        # IMPORTANT: We ensure consistent pixel format (yuv420p) throughout
        # to avoid format mismatches between boxblur output and overlay input.

        filters = []

        # Split input video (ensure consistent format first)
        filters.append("[0:v]format=yuv420p,split[blur_in][clean]")

        # Apply blur and create crossfade effect
        # Blur fades out as we transition to clean video
        # Use format=yuv420p after boxblur to ensure overlay compatibility
        filters.append(
            f"[blur_in]boxblur={blur}:5,format=yuv420p,"
            f"fade=t=out:st={intro_duration - fade_out}:d={fade_out}:alpha=1[blurred]"
        )

        # Overlay blurred on clean - blurred fades away revealing clean
        # The format=yuv420p ensures both streams have identical pixel format
        filters.append(
            f"[clean][blurred]overlay=0:0:format=yuv420:enable='lte(t,{intro_duration})'[bg_with_blur]"
        )

        # Title text with animation
        title_escaped = title.replace("'", "\\'").replace(":", "\\:")
        title_filter = self._build_overlay_text_filter(
            text=title_escaped,
            font=title_font,
            size=title_size,
            color=title_color,
            x="(w-text_w)/2",
            y=str(title_y),
            animation=animation,
            intro_duration=intro_duration,
            fade_in=fade_in,
            fade_out=fade_out
        )
        filters.append(f"[bg_with_blur]{title_filter}[with_title]")

        # Badge text
        if badge_text:
            badge_escaped = badge_text.replace("'", "\\'").replace(":", "\\:")
            badge_filter = self._build_overlay_text_filter(
                text=badge_escaped,
                font=title_font,
                size=int(title_size * 0.45),
                color=badge_color,
                x="(w-text_w)/2",
                y=str(badge_y),
                animation=animation,
                intro_duration=intro_duration,
                fade_in=fade_in + 0.15,
                fade_out=fade_out
            )
            filters.append(f"[with_title]{badge_filter}[final]")
        else:
            filters.append("[with_title]copy[final]")

        # Build video-only filter (swoosh audio disabled for stability)
        filter_complex = ";".join(filters)

        # Build FFmpeg command - simple and reliable
        cmd = [
            str(self.ffmpeg.ffmpeg_path),
            "-i", clip_path,
            "-filter_complex", filter_complex,
            "-map", "[final]",
            "-map", "0:a",  # Keep original audio
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-y",
            str(output_path)
        ]

        # Log detailed config for debugging
        logger.info(f"[Intro] Config: duration={intro_duration}s, title='{title[:30]}...', badge='{badge_text}', animation={animation}")
        logger.info(f"[Intro] Font path resolved: {self._get_font_path(title_font)}")
        logger.info(f"[Intro] Input: {clip_path}, Output: {output_path}")
        logger.debug(f"[Intro] Full FFmpeg command: {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await proc.communicate()
        stderr_text = stderr.decode(errors='replace')

        if proc.returncode != 0:
            # Log full stderr for debugging
            logger.error(f"[Intro] FFmpeg failed with return code {proc.returncode}")
            logger.error(f"[Intro] FFmpeg stderr:\n{stderr_text}")
            logger.error(f"[Intro] Config was: title='{title}', font='{title_font}', animation='{animation}'")

            # Check for common errors
            if "No such file" in stderr_text or "font" in stderr_text.lower():
                raise RuntimeError(f"Intro failed: Font not found. Try using 'Arial' or 'Impact'. Details: {stderr_text[:200]}")
            elif "filter" in stderr_text.lower():
                raise RuntimeError(f"Intro failed: FFmpeg filter error. {stderr_text[:200]}")
            else:
                raise RuntimeError(f"Intro overlay failed: {stderr_text[:300]}")

        if progress_callback:
            progress_callback(100.0)

        return {
            "output_path": str(output_path),
        }

    def _build_overlay_text_filter(
        self,
        text: str,
        font: str,
        size: int,
        color: str,
        x: str,
        y: str,
        animation: str,
        intro_duration: float,
        fade_in: float,
        fade_out: float
    ) -> str:
        """Build drawtext filter for overlay intro with GLOW effect (fades in then out)."""

        font_path = resolve_font_ffmpeg(font)
        visible_end = intro_duration

        # Alpha expression: fade in, stay, fade out
        alpha_expr = (
            f"if(lt(t,{fade_in}),t/{fade_in},"
            f"if(lt(t,{visible_end - fade_out}),1,"
            f"if(lt(t,{visible_end}),(({visible_end}-t)/{fade_out}),0)))"
        )

        # Animation expressions
        y_expr = y
        scale_expr = str(size)

        if animation == "slide":
            y_expr = f"{y}+40*(1-min(t/{fade_in},1))"
        elif animation == "bounce":
            y_expr = f"if(lt(t,{fade_in}),{y}+25*sin(t*14)*pow(0.5,t*6),{y})"
        elif animation == "zoom":
            # Zoom from 80% to 100%
            scale_expr = f"{size}*(0.8+0.2*min(t/{fade_in},1))"
        elif animation == "swoosh":
            # Swoosh: slide from right with overshoot
            x_offset = f"if(lt(t,{fade_in}),(w-text_w)/2+300*(1-min(t/{fade_in},1))*pow(0.3,t*3),(w-text_w)/2)"
            y_expr = y

        # WORLD CLASS GLOW EFFECT - Multiple layers for depth
        filters = []

        # Layer 1: Outer glow (larger, more transparent)
        glow_color = self._get_glow_color(color)
        glow_params = [
            f"text='{text}'",
            f"fontfile={font_path}",
            f"fontsize={scale_expr}",
            f"fontcolor={glow_color}@0.4",
            f"x={x}" if animation != "swoosh" else f"x={x_offset}",
            f"y={y_expr}",
            "borderw=12",
            f"bordercolor={glow_color}@0.3",
            f"alpha='{alpha_expr}'",
            f"enable='lte(t,{visible_end})'"
        ]
        filters.append(f"drawtext={':'.join(glow_params)}")

        # Layer 2: Inner glow (tighter)
        inner_glow_params = [
            f"text='{text}'",
            f"fontfile={font_path}",
            f"fontsize={scale_expr}",
            f"fontcolor={color}",
            f"x={x}" if animation != "swoosh" else f"x={x_offset}",
            f"y={y_expr}",
            "borderw=6",
            "bordercolor=black@0.8",
            "shadowcolor=black@0.7",
            "shadowx=4",
            "shadowy=4",
            f"alpha='{alpha_expr}'",
            f"enable='lte(t,{visible_end})'"
        ]
        filters.append(f"drawtext={':'.join(inner_glow_params)}")

        # Combine filters with intermediate labels
        return ",".join(filters)

    def _get_glow_color(self, base_color: str) -> str:
        """Get a glow color based on the base color."""
        # For white text, use cyan glow. For colored text, use the same color
        if base_color.lower() in ["white", "0xffffff", "0xFFFFFF"]:
            return "0x00FFFF"  # Cyan glow for white text
        return base_color

