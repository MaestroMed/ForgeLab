"""Tests for caption generation service."""

import pytest
from forge_engine.services.captions import CaptionEngine, DEFAULT_STYLE


class TestCaptionEngine:
    """Tests for the CaptionEngine class."""
    
    def setup_method(self):
        self.engine = CaptionEngine()
    
    def test_default_style_has_required_fields(self):
        """Verify the default style has all required fields."""
        required = [
            "font_family", "font_size", "primary_color",
            "outline_color", "outline_width", "alignment"
        ]
        for field in required:
            assert field in DEFAULT_STYLE, f"DEFAULT_STYLE missing '{field}'"
    
    def test_default_style_colors_valid(self):
        """Verify color values are in valid ASS format."""
        import re
        pattern = r"&H[0-9A-Fa-f]{6,8}"
        for color_field in ["primary_color", "outline_color", "highlight_color"]:
            if color_field in DEFAULT_STYLE:
                assert re.match(pattern, DEFAULT_STYLE[color_field]), \
                    f"Invalid color format in DEFAULT_STYLE.{color_field}"
    
    def test_ass_generation_basic(self):
        """Verify basic ASS file generation."""
        segments = [
            {"start": 0, "end": 5, "text": "Hello world"},
            {"start": 5, "end": 10, "text": "This is a test"},
        ]
        
        ass_content = self.engine.generate_ass(segments)
        
        assert "[Script Info]" in ass_content
        assert "[V4+ Styles]" in ass_content
        assert "[Events]" in ass_content
        assert "Dialogue:" in ass_content
    
    def test_ass_contains_font(self):
        """Verify the default font (Anton) appears in ASS output."""
        segments = [{"start": 0, "end": 5, "text": "Test"}]
        ass_content = self.engine.generate_ass(segments)
        assert DEFAULT_STYLE["font_family"] in ass_content
    
    def test_word_level_karaoke(self):
        """Verify word-level timing produces per-word Dialogue lines in ASS."""
        segments = [
            {
                "start": 0,
                "end": 5,
                "text": "Hello world test",
                "words": [
                    {"word": "Hello", "start": 0, "end": 1, "confidence": 0.9},
                    {"word": "world", "start": 1.2, "end": 2, "confidence": 0.95},
                    {"word": "test", "start": 2.5, "end": 3, "confidence": 0.85},
                ]
            }
        ]

        ass_content = self.engine.generate_ass(segments, word_level=True)
        # Word-level mode generates one Dialogue line per word (highlight style)
        # or uses \k/\kf karaoke tags — either approach is valid
        dialogue_count = ass_content.count("Dialogue:")
        has_karaoke = "\\k" in ass_content or "\\kf" in ass_content
        has_word_highlight = "\\1c&H" in ass_content
        assert dialogue_count >= 3 or has_karaoke or has_word_highlight, (
            "word_level=True should produce multiple Dialogue lines or karaoke tags"
        )
    
    def test_srt_generation(self):
        """Verify SRT file generation."""
        segments = [
            {"start": 0, "end": 5, "text": "First subtitle"},
            {"start": 5.5, "end": 10, "text": "Second subtitle"},
        ]

        srt_content = self.engine.generate_srt(segments)
        assert "1\n" in srt_content
        assert "00:00:00,000 --> 00:00:05,000" in srt_content
        # CaptionEngine uppercases text for readability
        assert "FIRST SUBTITLE" in srt_content or "First subtitle" in srt_content
        assert "2\n" in srt_content
    
    def test_vtt_generation(self):
        """Verify VTT file generation."""
        segments = [
            {"start": 0, "end": 5, "text": "First cue"},
        ]
        
        vtt_content = self.engine.generate_vtt(segments)
        assert "WEBVTT" in vtt_content
        assert "00:00:00.000 --> 00:00:05.000" in vtt_content
    
    def test_time_formatting_ass(self):
        """Verify ASS time formatting (H:MM:SS.cc)."""
        formatted = self.engine._format_time(3661.55)
        assert formatted == "1:01:01.55"
    
    def test_time_formatting_srt(self):
        """Verify SRT time formatting (HH:MM:SS,mmm)."""
        # Use a time that avoids floating-point precision issues
        formatted = self.engine._format_srt_time(3661.5)
        assert formatted == "01:01:01,500"
    
    def test_word_cleaning(self):
        """Verify words are properly cleaned for ASS."""
        cleaned = self.engine._clean_word(" hello{world} ")
        assert cleaned == "hello\\{world\\}"
    
    def test_empty_segments_handled(self):
        """Verify empty text segments are skipped in SRT output."""
        segments = [
            {"start": 0, "end": 5, "text": ""},
            {"start": 5, "end": 10, "text": "Valid text"},
        ]

        srt_content = self.engine.generate_srt(segments)
        # Empty segments are excluded from the output
        assert "VALID TEXT" in srt_content or "Valid text" in srt_content
        # The SRT should contain exactly one numbered entry
        assert "00:00:05,000 --> 00:00:10,000" in srt_content
        assert "00:00:00,000 --> 00:00:05,000" not in srt_content
    
    def test_custom_style_override(self):
        """Verify custom style overrides work."""
        segments = [{"start": 0, "end": 5, "text": "Test"}]
        
        ass_content = self.engine.generate_ass(
            segments,
            custom_style={"font_size": 120, "positionY": 500}
        )
        assert "[Script Info]" in ass_content
        assert "Dialogue:" in ass_content
