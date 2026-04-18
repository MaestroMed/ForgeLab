"""Unit tests for critical services.

Tests the fixes made in the stabilisation plan:
- Job queue single worker + no auto-restart
- Export validation
- Cold open timeline generation
- Intro font fallback
"""

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestJobManager:
    """Tests for the job queue system."""
    
    def test_single_worker_config(self):
        """Verify job manager uses 1 worker to prevent race conditions."""
        from forge_engine.core.jobs import JobManager
        
        manager = JobManager()
        assert manager._max_workers == 1, \
            f"Expected 1 worker, got {manager._max_workers}"
    
    def test_has_pick_lock(self):
        """Verify job manager has an asyncio.Lock for job picking."""
        from forge_engine.core.jobs import JobManager
        
        manager = JobManager()
        assert hasattr(manager, '_pick_lock')
        assert isinstance(manager._pick_lock, asyncio.Lock)


class TestExportValidation:
    """Tests for the export validation method."""
    
    @pytest.mark.asyncio
    async def test_validates_nonexistent_file(self):
        """Verify validation fails for missing files."""
        from forge_engine.services.export import ExportService
        
        service = ExportService()
        result = await service._validate_export("/nonexistent/path.mp4")
        
        assert result["valid"] is False
        assert "does not exist" in result["errors"][0]
    
    @pytest.mark.asyncio
    async def test_validates_empty_file(self, tmp_path):
        """Verify validation fails for empty/tiny files."""
        from forge_engine.services.export import ExportService
        
        empty_file = tmp_path / "empty.mp4"
        empty_file.write_bytes(b"x" * 100)
        
        service = ExportService()
        result = await service._validate_export(str(empty_file))
        
        assert result["valid"] is False
        assert any("too small" in e for e in result["errors"])


class TestColdOpenTimeline:
    """Tests for cold open timeline generation."""
    
    @pytest.mark.asyncio
    async def test_finds_hooks_in_transcript(self):
        """Verify cold open engine finds hooks from transcript patterns."""
        from forge_engine.services.cold_open import ColdOpenEngine
        
        engine = ColdOpenEngine()
        
        segment = {"start_time": 0, "end_time": 60}
        transcript = [
            {"start": 5, "end": 10, "text": "Alors on commence tranquille"},
            {"start": 15, "end": 20, "text": "C'est pas mal du tout"},
            {"start": 35, "end": 42, "text": "NON MAIS ATTEND?! C'est INCROYABLE!! On l'a fait!!"},
            {"start": 45, "end": 50, "text": "Voila c'etait bien"},
        ]
        
        variations = await engine.generate_cold_opens(
            segment=segment,
            transcript_segments=transcript,
            language="fr",
        )
        
        # Should find hooks and generate at least one variation + control
        assert len(variations) >= 1
        
        # Control should always be present
        control = [v for v in variations if v.id == "control"]
        assert len(control) == 1
    
    def test_ffmpeg_filter_includes_audio(self):
        """Verify generated FFmpeg filter includes audio streams."""
        from forge_engine.services.cold_open import (
            ColdOpenEngine, ColdOpenVariation, ColdOpenHook, ColdOpenStyle
        )
        
        engine = ColdOpenEngine()
        
        variation = ColdOpenVariation(
            id="test",
            style=ColdOpenStyle.HARD_CUT,
            hook=ColdOpenHook(start_time=30, end_time=35, text="Hook!", score=8),
            original_start=0,
            original_end=60,
            timeline=[
                {"type": "hook", "start": 30, "end": 35},
                {"type": "segment", "start": 0, "end": 30},
                {"type": "segment", "start": 35, "end": 60},
            ],
        )
        
        filter_str = engine.generate_ffmpeg_filter(variation)
        
        assert "atrim" in filter_str, "Filter should include audio trim"
        assert "asetpts" in filter_str, "Filter should include audio timestamp reset"
        assert "a=1" in filter_str, "Concat should include 1 audio stream"


class TestIntroFontPath:
    """Tests for intro font resolution."""
    
    def test_font_fallback_returns_string(self):
        """Verify font path resolution always returns a string."""
        from forge_engine.services.intro import IntroEngine
        
        engine = IntroEngine()
        
        result = engine._get_font_path("NonexistentFont12345")
        assert isinstance(result, str)
        assert len(result) > 0
    
    def test_known_fonts_found_on_windows(self):
        """Verify common Windows fonts are found."""
        import platform
        if platform.system() != "Windows":
            pytest.skip("Windows-only test")
        
        from forge_engine.services.intro import IntroEngine
        engine = IntroEngine()
        
        for font_name in ["Arial", "Impact"]:
            result = engine._get_font_path(font_name)
            assert "Fonts" in result or font_name.lower() in result.lower(), \
                f"Font '{font_name}' not found: got '{result}'"
    
    def test_font_escaping_consistent(self):
        """Verify font path escaping uses \\: consistently."""
        import platform
        if platform.system() != "Windows":
            pytest.skip("Windows-only test")
        
        from forge_engine.services.intro import IntroEngine
        engine = IntroEngine()
        
        result = engine._get_font_path("Arial")
        
        # Should use forward slashes
        assert "\\" not in result or "\\:" in result
        # Should have escaped colon
        assert "\\:" in result, f"Missing escaped colon in: {result}"
        # Should NOT have double-escaped colons
        assert "\\\\:" not in result, f"Double-escaped colon in: {result}"


class TestMonitorRecovery:
    """Tests for monitor auto-recovery settings."""
    
    def test_auto_recovery_disabled_by_default(self):
        """Verify auto-recovery is disabled to prevent runaway Whisper."""
        from forge_engine.services.monitor import MonitorService
        
        assert MonitorService.AUTO_RECOVERY_ENABLED is False
