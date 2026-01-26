"""Caption generation engine for ASS subtitles."""

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# TikTok-optimized resolution (9:16 vertical)
TIKTOK_WIDTH = 1080
TIKTOK_HEIGHT = 1920

# Minimum font size as percentage of screen height (5-7%)
MIN_FONT_SIZE_PERCENT = 0.045  # ~86px on 1920h - Raised for mobile visibility
MAX_FONT_SIZE_PERCENT = 0.060  # ~115px on 1920h - World Class standard

def calculate_optimal_font_size(height: int, base_size: int) -> int:
    """Calculate font size ensuring 5-7% of screen height minimum."""
    min_size = int(height * MIN_FONT_SIZE_PERCENT)
    max_size = int(height * MAX_FONT_SIZE_PERCENT)
    # Ensure at least minimum, but respect max
    return max(min_size, min(base_size, max_size))


# WORLD CLASS TIKTOK STYLES - Optimized for maximum viral potential
CAPTION_STYLES = {
    # VIRAL_PRO - THE WORLD CLASS DEFAULT - Hormozi/MrBeast level
    # This is the new gold standard for viral subtitles
    "viral_pro": {
        "font_family": "Montserrat",
        "font_size": 96,  # 5% of 1920 - Maximum mobile visibility
        "primary_color": "&H00FFFFFF",  # Pure white
        "outline_color": "&H00000000",  # Deep black
        "outline_width": 5,  # Thick for contrast
        "shadow_depth": 4,  # 3D depth effect
        "shadow_color": "&H80000000",  # Semi-transparent black shadow
        "bold": True,
        "alignment": 5,  # Center screen - TikTok focus zone
        "margin_v": 960,  # True center (1920/2)
        "highlight_color": "&H0000FF00",  # Vert vif (#00FF00) - Maximum attention
        "highlight_scale": 1.15,  # Pop effect scale
        "max_words_per_line": 3,  # Ultra-readable
        "max_lines": 2,
        "animation": "pop_scale",  # Pop with scale effect
        "animation_duration": 0.08,  # Quick snap
    },
    # VIRAL - Karaoke style for maximum engagement
    "viral": {
        "font_family": "Montserrat",
        "font_size": 72,  # Large for TikTok
        "primary_color": "&H00FFFFFF",  # White
        "outline_color": "&H00000000",  # Black
        "outline_width": 4,
        "shadow_depth": 2,
        "bold": True,
        "alignment": 5,  # Center screen
        "margin_v": 400,  # Center vertically
        "highlight_color": "&H00FFBF00",  # Cyan highlight (#00BFFF)
    },
    # CLEAN - Readable and professional
    "clean": {
        "font_family": "Inter",
        "font_size": 64,
        "primary_color": "&H00FFFFFF",  # White
        "outline_color": "&H00000000",  # Black
        "outline_width": 3,
        "shadow_depth": 2,
        "bold": True,
        "alignment": 2,  # Bottom center
        "margin_v": 200,  # Safe bottom area
        "highlight_color": "&H0000D7FF",  # Gold highlight (#FFD700)
    },
    # IMPACT - Attention-grabbing MrBeast style
    "impact": {
        "font_family": "Impact",
        "font_size": 80,
        "primary_color": "&H00FFFFFF",  # White
        "outline_color": "&H00000000",  # Black
        "outline_width": 5,
        "shadow_depth": 3,
        "bold": False,  # Impact is already bold
        "alignment": 5,  # Center screen
        "margin_v": 450,
        "highlight_color": "&H000000FF",  # Red highlight (#FF0000)
    },
    # Legacy aliases - now point to viral_pro
    "forge_minimal": {
        "font_family": "Montserrat",
        "font_size": 96,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "outline_width": 5,
        "shadow_depth": 4,
        "bold": True,
        "alignment": 5,
        "margin_v": 960,
        "highlight_color": "&H0000FF00",  # Vert vif (#00FF00)
    },
    "default": {
        "font_family": "Montserrat",
        "font_size": 96,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "outline_width": 5,
        "shadow_depth": 4,
        "shadow_color": "&H80000000",
        "bold": True,
        "alignment": 5,
        "margin_v": 960,
        "highlight_color": "&H0000FF00",  # Vert vif (#00FF00)
        "highlight_scale": 1.15,
        "max_words_per_line": 3,
        "max_lines": 2,
        "animation": "pop_scale",
        "animation_duration": 0.08,
    },
}


class CaptionEngine:
    """Service for generating premium ASS subtitles optimized for TikTok."""
    
    def __init__(self, width: int = TIKTOK_WIDTH, height: int = TIKTOK_HEIGHT):
        self.output_width = width
        self.output_height = height
        self.safe_margin_top = 120  # Account for TikTok UI
        self.safe_margin_bottom = 250  # Account for TikTok buttons
    
    def generate_ass(
        self,
        transcript_segments: List[Dict[str, Any]],
        style_name: str = "clean",
        custom_style: Optional[Dict[str, Any]] = None,
        word_level: bool = True,
        max_words_per_line: int = 5,  # Reduced for better readability
        max_lines: int = 2,
        facecam_position: Optional[str] = None  # "top-left", "top-right", etc.
    ) -> str:
        """Generate ASS subtitle file content with TikTok optimization."""
        # Map style aliases - WORLD CLASS: viral_pro is the default base
        style_map = {
            "custom": "viral_pro",  # Custom styles use viral_pro as base
            "default": "viral_pro",  # Default is now viral_pro
            "forge_minimal": "viral_pro",  # Legacy alias
            "mrbeast": "impact",
            "karaoke": "viral",
            "minimalist": "clean",
        }
        actual_style_name = style_map.get(style_name, style_name)
        logger.info(f"[Captions] Style mapping: '{style_name}' -> '{actual_style_name}'")
        
        # WORLD CLASS: Use viral_pro as fallback instead of clean
        style = CAPTION_STYLES.get(actual_style_name, CAPTION_STYLES["viral_pro"]).copy()
        
        # FORCE MINIMUM FONT SIZE based on screen height
        base_font_size = style.get("font_size", 64)
        style["font_size"] = calculate_optimal_font_size(self.output_height, base_font_size)
        logger.info(f"[Captions] Font size: {base_font_size} -> {style['font_size']} (min 5% of {self.output_height}px)")
        
        if custom_style:
            # Convert custom style to ASS format (handle both camelCase and snake_case)
            font_family = custom_style.get("fontFamily") or custom_style.get("font_family")
            if font_family:
                style["font_family"] = font_family
            
            font_size = custom_style.get("fontSize") or custom_style.get("font_size")
            if font_size:
                # Also enforce minimum for custom sizes
                style["font_size"] = calculate_optimal_font_size(self.output_height, font_size)
            
            font_weight = custom_style.get("fontWeight") or custom_style.get("font_weight")
            if font_weight:
                style["bold"] = font_weight >= 600
            
            color = custom_style.get("color")
            if color:
                style["primary_color"] = self._hex_to_ass_color(color)
            
            outline_color = custom_style.get("outlineColor") or custom_style.get("outline_color")
            if outline_color:
                style["outline_color"] = self._hex_to_ass_color(outline_color)
            
            outline_width = custom_style.get("outlineWidth") or custom_style.get("outline_width")
            if outline_width is not None:
                # Scale outline with font size
                style["outline_width"] = max(2, min(outline_width, 6))
            
            highlight_color = custom_style.get("highlightColor") or custom_style.get("highlight_color")
            if highlight_color:
                style["highlight_color"] = self._hex_to_ass_color(highlight_color)
            
            # Handle position - smart positioning based on facecam
            position_y = custom_style.get("positionY") or custom_style.get("position_y")
            position = custom_style.get("position", "bottom")
            
            if position_y is not None and position_y > 0:
                # Custom Y position from top
                style["alignment"] = 2  # Bottom center
                style["margin_v"] = max(self.safe_margin_bottom, self.output_height - position_y - 80)
            else:
                # Smart position based on facecam detection
                style["alignment"], style["margin_v"] = self._compute_safe_position(
                    position, facecam_position
                )
            
            # Handle animation type - THIS WAS MISSING!
            animation = custom_style.get("animation")
            if animation:
                # Map frontend animation names to backend
                animation_map = {
                    "none": "none",
                    "fade": "none",  # Simple fade handled separately
                    "pop": "pop_scale",
                    "bounce": "bounce",
                    "glow": "glow",
                    "wave": "wave",
                }
                style["animation"] = animation_map.get(animation, "pop_scale")
                logger.info(f"[Captions] Animation from custom_style: {animation} -> {style['animation']}")
            
            # Handle animation duration if provided
            animation_duration = custom_style.get("animation_duration") or custom_style.get("animationDuration")
            if animation_duration:
                style["animation_duration"] = animation_duration
        
        logger.info(f"[Captions] Final style: font={style['font_family']} size={style['font_size']} align={style['alignment']} margin_v={style['margin_v']} animation={style.get('animation', 'default')}")
        
        # Build ASS file
        lines = [
            "[Script Info]",
            "Title: FORGE Captions",
            "ScriptType: v4.00+",
            f"PlayResX: {self.output_width}",
            f"PlayResY: {self.output_height}",
            "WrapStyle: 0",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            self._generate_style_line("Default", style),
            self._generate_style_line("Highlight", {**style, "primary_color": style.get("highlight_color", "&H0000FFFF")}),
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
        
        # Generate dialogue lines
        for segment in transcript_segments:
            if word_level and "words" in segment:
                # Word-level timing with karaoke effect
                dialogue_lines = self._generate_word_level_captions(
                    segment,
                    style,
                    max_words_per_line,
                    max_lines
                )
            else:
                # Phrase-level captions
                dialogue_lines = self._generate_phrase_captions(
                    segment,
                    max_words_per_line,
                    max_lines
                )
            
            lines.extend(dialogue_lines)
        
        return "\n".join(lines)
    
    def _compute_safe_position(
        self, 
        position: str, 
        facecam_position: Optional[str] = None
    ) -> tuple:
        """Compute safe subtitle position avoiding facecam overlap.
        
        Returns (alignment, margin_v) tuple.
        """
        # ASS alignment values:
        # 1=bottom-left, 2=bottom-center, 3=bottom-right
        # 4=middle-left, 5=middle-center, 6=middle-right
        # 7=top-left, 8=top-center, 9=top-right
        
        # Default safe zones for TikTok (accounting for UI elements)
        safe_bottom_margin = self.safe_margin_bottom  # 250px from bottom
        safe_center_margin = int(self.output_height * 0.25)  # ~480px
        safe_top_margin = self.safe_margin_top  # 120px from top
        
        # If facecam detected, adjust position to avoid it
        if facecam_position:
            if "top" in facecam_position:
                # Facecam at top - prefer bottom subtitles
                if position == "top":
                    position = "bottom"  # Override to avoid overlap
            elif "bottom" in facecam_position:
                # Facecam at bottom - prefer center or top
                if position == "bottom":
                    position = "center"
            elif "center" in facecam_position:
                # Full screen content - use safe bottom
                position = "bottom"
        
        # Compute based on final position
        if position == "center":
            return (5, safe_center_margin)  # Middle center
        elif position == "top":
            return (8, safe_top_margin)  # Top center
        else:  # bottom (default)
            return (2, safe_bottom_margin)  # Bottom center
    
    def _generate_style_line(self, name: str, style: Dict[str, Any]) -> str:
        """Generate ASS style line."""
        bold = -1 if style.get("bold", True) else 0
        font_size = style.get('font_size', 64)
        
        return (
            f"Style: {name},"
            f"{style.get('font_family', 'Inter')},"
            f"{font_size},"
            f"{style.get('primary_color', '&H00FFFFFF')},"
            f"{style.get('highlight_color', '&H0000FF00')},"  # SecondaryColour = karaoke fill color
            f"{style.get('outline_color', '&H00000000')},"
            f"&H80000000,"  # Back color
            f"{bold},0,0,0,"  # Bold, Italic, Underline, StrikeOut
            f"100,100,"  # ScaleX, ScaleY
            f"0,0,"  # Spacing, Angle
            f"1,"  # BorderStyle (1 = outline + drop shadow)
            f"{style.get('outline_width', 3)},"
            f"{style.get('shadow_depth', 2)},"
            f"{style.get('alignment', 2)},"
            f"20,20,"  # MarginL, MarginR
            f"{style.get('margin_v', 200)},"
            f"1"  # Encoding
        )
    
    def _generate_word_level_captions(
        self,
        segment: Dict[str, Any],
        style: Dict[str, Any],
        max_words_per_line: int,
        max_lines: int
    ) -> List[str]:
        """
        Generate WORLD CLASS word-by-word karaoke captions with advanced animations.
        
        Features:
        - Pop scale effect with cubic easing on each word
        - Highlight color transition (white -> gold/cyan)
        - 3D shadow depth effect
        - Smooth fade in/out
        """
        words = segment.get("words", [])
        if not words:
            return self._generate_phrase_captions(segment, max_words_per_line, max_lines)
        
        lines = []
        
        # Get animation settings from style
        animation_type = style.get("animation", "pop_scale")
        highlight_color = style.get("highlight_color", "&H0000D7FF")  # Gold default
        primary_color = style.get("primary_color", "&H00FFFFFF")  # White default
        shadow_depth = style.get("shadow_depth", 4)
        highlight_scale = style.get("highlight_scale", 1.15)  # 115% scale on highlight
        animation_duration = style.get("animation_duration", 0.08)  # 80ms pop
        
        # Group words into display chunks
        chunks = []
        current_chunk = []
        
        for word in words:
            current_chunk.append(word)
            if len(current_chunk) >= max_words_per_line:
                chunks.append(current_chunk)
                current_chunk = []
        
        if current_chunk:
            chunks.append(current_chunk)
        
        # Generate dialogue for each chunk
        for chunk in chunks:
            if not chunk:
                continue
            
            start_time = chunk[0]["start"]
            end_time = chunk[-1]["end"]
            
            # Build advanced karaoke text with timing and animations
            text_parts = []
            prev_end = start_time
            
            for word_idx, word in enumerate(chunk):
                word_duration = int((word["end"] - word["start"]) * 100)  # centiseconds
                gap = int((word["start"] - prev_end) * 100)
                
                if gap > 0:
                    text_parts.append(f"{{\\k{gap}}}")
                
                # Clean word
                clean_word = self._clean_word(word["word"])
                
                if animation_type == "pop_scale":
                    # WORLD CLASS POP SCALE ANIMATION
                    # When word becomes active:
                    # 1. Scale up 115% with cubic easing
                    # 2. Change color to highlight
                    # 3. Add subtle blur for glow effect
                    # After word:
                    # 1. Scale back to 100%
                    # 2. Return to primary color
                    
                    pop_duration_cs = int(animation_duration * 100)  # 8 centiseconds
                    scale_percent = int(highlight_scale * 100)  # 115
                    
                    # Use \kf for smooth fill + add transform for pop effect
                    # The transform animates scale and color when the word is "active"
                    word_tag = (
                        f"{{\\kf{word_duration}}}"  # Karaoke fill
                        f"{{\\t(0,{pop_duration_cs},0.5,\\fscx{scale_percent}\\fscy{scale_percent}\\1c{highlight_color}\\blur0.5)}}"  # Pop up with cubic easing
                        f"{{\\t({word_duration - pop_duration_cs},{word_duration},0.5,\\fscx100\\fscy100\\1c{primary_color}\\blur0)}}"  # Pop down
                        f"{clean_word}"
                    )
                    text_parts.append(word_tag)
                    
                elif animation_type == "bounce":
                    # BOUNCE ANIMATION - word drops in with bounce
                    word_duration_cs = max(5, word_duration)
                    bounce_tag = (
                        f"{{\\kf{word_duration}}}"
                        f"{{\\t(0,5,\\frz-3)}}"  # Rotate slightly
                        f"{{\\t(5,10,\\frz3)}}"  # Rotate back
                        f"{{\\t(10,15,\\frz0)}}"  # Settle
                        f"{{\\t(0,{word_duration_cs},\\1c{highlight_color})}}"  # Color change
                        f"{clean_word}"
                    )
                    text_parts.append(bounce_tag)
                    
                elif animation_type == "glow":
                    # GLOW ANIMATION - word glows when active
                    word_tag = (
                        f"{{\\kf{word_duration}}}"
                        f"{{\\t(0,10,\\blur3\\bord6)}}"  # Increase blur and border
                        f"{{\\t({word_duration - 10},{word_duration},\\blur0\\bord{style.get('outline_width', 4)})}}"  # Back to normal
                        f"{{\\1c{highlight_color}}}"
                        f"{clean_word}"
                    )
                    text_parts.append(word_tag)
                    
                elif animation_type == "wave":
                    # WAVE ANIMATION - subtle vertical wave
                    word_tag = (
                        f"{{\\kf{word_duration}}}"
                        f"{{\\t(0,15,\\fry5)}}"  # Tilt forward
                        f"{{\\t(15,{word_duration},\\fry0)}}"  # Back
                        f"{{\\1c{highlight_color}}}"
                        f"{clean_word}"
                    )
                    text_parts.append(word_tag)
                    
                else:
                    # DEFAULT: Simple karaoke with color change
                    text_parts.append(f"{{\\kf{word_duration}}}{clean_word}")
                
                prev_end = word["end"]
            
            text = " ".join(text_parts).replace("  ", " ")
            
            # Add smooth fade in/out with 3D shadow effect
            # Entry: fade in + slight scale up from 90%
            # Exit: fade out + slight scale down to 95%
            intro_effect = (
                f"{{\\fad(80,120)}}"  # 80ms fade in, 120ms fade out
                f"{{\\t(0,50,\\fscx100\\fscy100)}}"  # Settle to 100%
                f"{{\\shad{shadow_depth}}}"  # Apply shadow depth
            )
            
            text = intro_effect + text
            
            lines.append(
                f"Dialogue: 0,{self._format_time(start_time)},{self._format_time(end_time)},"
                f"Default,,0,0,0,,{text}"
            )
        
        return lines
    
    def _generate_phrase_captions(
        self,
        segment: Dict[str, Any],
        max_words_per_line: int,
        max_lines: int
    ) -> List[str]:
        """Generate phrase-level captions."""
        text = segment.get("text", "").strip()
        start = segment.get("start", 0)
        end = segment.get("end", 0)
        
        if not text:
            return []
        
        # Wrap text
        words = text.split()
        wrapped_lines = []
        current_line = []
        
        for word in words:
            current_line.append(word)
            if len(current_line) >= max_words_per_line:
                wrapped_lines.append(" ".join(current_line))
                current_line = []
        
        if current_line:
            wrapped_lines.append(" ".join(current_line))
        
        # Limit to max lines
        if len(wrapped_lines) > max_lines:
            wrapped_lines = wrapped_lines[:max_lines]
            wrapped_lines[-1] += "..."
        
        display_text = "\\N".join(wrapped_lines)
        
        # Add fade animation
        display_text = "{\\fad(150,150)}" + display_text
        
        return [
            f"Dialogue: 0,{self._format_time(start)},{self._format_time(end)},"
            f"Default,,0,0,0,,{display_text}"
        ]
    
    def _hex_to_ass_color(self, hex_color: str) -> str:
        """Convert hex color (#RRGGBB) to ASS format (&HAABBGGRR)."""
        if not hex_color or hex_color == "transparent":
            return "&H00000000"
        
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            # ASS uses AABBGGRR format (alpha, blue, green, red)
            return f"&H00{b:02X}{g:02X}{r:02X}"
        return "&H00FFFFFF"
    
    def _clean_word(self, word: str) -> str:
        """Clean a word for display."""
        # Remove extra whitespace
        word = word.strip()
        # Escape ASS special characters
        word = word.replace("\\", "\\\\")
        word = word.replace("{", "\\{")
        word = word.replace("}", "\\}")
        return word
    
    def _format_time(self, seconds: float) -> str:
        """Format time for ASS (H:MM:SS.cc)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        centiseconds = int((secs % 1) * 100)
        secs = int(secs)
        
        return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"
    
    def generate_srt(
        self,
        transcript_segments: List[Dict[str, Any]],
        max_words_per_line: int = 8
    ) -> str:
        """Generate SRT subtitle file content."""
        lines = []
        
        for i, segment in enumerate(transcript_segments, 1):
            start = segment.get("start", 0)
            end = segment.get("end", 0)
            text = segment.get("text", "").strip()
            
            if not text:
                continue
            
            # Wrap text
            words = text.split()
            wrapped = []
            current = []
            
            for word in words:
                current.append(word)
                if len(current) >= max_words_per_line:
                    wrapped.append(" ".join(current))
                    current = []
            
            if current:
                wrapped.append(" ".join(current))
            
            lines.append(str(i))
            lines.append(f"{self._format_srt_time(start)} --> {self._format_srt_time(end)}")
            lines.extend(wrapped)
            lines.append("")
        
        return "\n".join(lines)
    
    def generate_vtt(
        self,
        transcript_segments: List[Dict[str, Any]],
        max_words_per_line: int = 8
    ) -> str:
        """Generate VTT subtitle file content."""
        lines = ["WEBVTT", ""]
        
        for i, segment in enumerate(transcript_segments, 1):
            start = segment.get("start", 0)
            end = segment.get("end", 0)
            text = segment.get("text", "").strip()
            
            if not text:
                continue
            
            # Wrap text
            words = text.split()
            wrapped = []
            current = []
            
            for word in words:
                current.append(word)
                if len(current) >= max_words_per_line:
                    wrapped.append(" ".join(current))
                    current = []
            
            if current:
                wrapped.append(" ".join(current))
            
            lines.append(f"{self._format_vtt_time(start)} --> {self._format_vtt_time(end)}")
            lines.extend(wrapped)
            lines.append("")
        
        return "\n".join(lines)
    
    def _format_srt_time(self, seconds: float) -> str:
        """Format time for SRT (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
    
    def _format_vtt_time(self, seconds: float) -> str:
        """Format time for VTT (HH:MM:SS.mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"
    
    def save_captions(
        self,
        transcript_segments: List[Dict[str, Any]],
        output_dir: Path,
        base_name: str = "captions",
        style_name: str = "forge_minimal"
    ) -> Dict[str, str]:
        """Save captions in multiple formats."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        paths = {}
        
        # ASS
        ass_content = self.generate_ass(transcript_segments, style_name)
        ass_path = output_dir / f"{base_name}.ass"
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_content)
        paths["ass"] = str(ass_path)
        
        # SRT
        srt_content = self.generate_srt(transcript_segments)
        srt_path = output_dir / f"{base_name}.srt"
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)
        paths["srt"] = str(srt_path)
        
        # VTT
        vtt_content = self.generate_vtt(transcript_segments)
        vtt_path = output_dir / f"{base_name}.vtt"
        with open(vtt_path, "w", encoding="utf-8") as f:
            f.write(vtt_content)
        paths["vtt"] = str(vtt_path)
        
        return paths









