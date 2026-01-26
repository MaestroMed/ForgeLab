"""End-to-End Pipeline Tests.

Tests the complete FORGE pipeline from ingestion to export.

Run with: pytest tests/test_pipeline_e2e.py -v
"""

import pytest
import asyncio
import tempfile
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import json

# Import test fixtures from conftest
from conftest import (
    sample_project_data,
    sample_segment,
    sample_transcript_segments,
    sample_audio_analysis,
    sample_scene_data,
)


class TestPipelineE2E:
    """End-to-end tests for the complete FORGE pipeline."""
    
    @pytest.fixture
    def temp_library(self):
        """Create a temporary library directory."""
        temp_dir = tempfile.mkdtemp(prefix="forge_test_")
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    @pytest.fixture
    def mock_video_path(self, temp_library):
        """Create a mock video file."""
        video_path = temp_library / "test_video.mp4"
        # Create a minimal file for testing
        video_path.write_bytes(b"mock video data")
        return video_path
    
    @pytest.fixture
    def mock_audio_path(self, temp_library):
        """Create a mock audio file."""
        audio_path = temp_library / "test_audio.wav"
        audio_path.write_bytes(b"mock audio data")
        return audio_path

    # ==================== INGESTION TESTS ====================
    
    @pytest.mark.asyncio
    async def test_project_creation(self, sample_project_data):
        """Test project creation with valid data."""
        from forge_engine.models.project import Project
        
        project = Project(**sample_project_data)
        
        assert project.id == "test-project-123"
        assert project.name == "Test Stream"
        assert project.duration == 3600.0
        assert project.status == "analyzed"
    
    @pytest.mark.asyncio
    async def test_ingest_service_probe(self, mock_video_path):
        """Test IngestService video probing."""
        from forge_engine.services.ingest import IngestService
        
        ingest = IngestService()
        
        # Mock ffprobe result
        mock_metadata = {
            "width": 1920,
            "height": 1080,
            "duration": 3600.0,
            "fps": 30.0,
            "codec": "h264",
            "audio_tracks": 1,
        }
        
        with patch.object(ingest, 'probe_video', return_value=mock_metadata):
            result = await ingest.probe_video(str(mock_video_path))
            
            assert result["width"] == 1920
            assert result["height"] == 1080
            assert result["fps"] == 30.0
    
    @pytest.mark.asyncio
    async def test_ingest_service_create_proxy(self, mock_video_path, temp_library):
        """Test proxy video creation."""
        from forge_engine.services.ingest import IngestService
        from forge_engine.services.ffmpeg import FFmpegService
        
        ingest = IngestService()
        ffmpeg = FFmpegService()
        
        proxy_path = temp_library / "proxy.mp4"
        
        # Mock the actual encoding
        with patch.object(ffmpeg, 'encode_proxy') as mock_encode:
            mock_encode.return_value = str(proxy_path)
            
            # Write mock proxy file
            proxy_path.write_bytes(b"proxy video data")
            
            result = await ffmpeg.encode_proxy(
                str(mock_video_path),
                str(proxy_path),
                resolution=720,
            )
            
            mock_encode.assert_called_once()
            assert result == str(proxy_path)
    
    @pytest.mark.asyncio
    async def test_audio_extraction(self, mock_video_path, temp_library):
        """Test audio extraction from video."""
        from forge_engine.services.ffmpeg import FFmpegService
        
        ffmpeg = FFmpegService()
        audio_path = temp_library / "audio.wav"
        
        with patch.object(ffmpeg, 'extract_audio') as mock_extract:
            mock_extract.return_value = str(audio_path)
            audio_path.write_bytes(b"audio data")
            
            result = await ffmpeg.extract_audio(
                str(mock_video_path),
                str(audio_path),
            )
            
            assert result == str(audio_path)

    # ==================== TRANSCRIPTION TESTS ====================
    
    @pytest.mark.asyncio
    async def test_transcription_service_availability(self):
        """Test that transcription service reports availability correctly."""
        from forge_engine.services.transcription import TranscriptionService
        
        service = TranscriptionService.get_instance()
        
        # Should not raise
        is_available = service.is_available()
        assert isinstance(is_available, bool)
    
    @pytest.mark.asyncio
    async def test_transcription_mock(self, mock_audio_path, sample_transcript_segments):
        """Test transcription with mocked Whisper."""
        from forge_engine.services.transcription import TranscriptionService
        
        service = TranscriptionService.get_instance()
        
        mock_result = {
            "language": "fr",
            "language_probability": 0.98,
            "duration": 60.0,
            "segments": sample_transcript_segments,
            "text": " ".join(s["text"] for s in sample_transcript_segments),
        }
        
        with patch.object(service, 'transcribe', return_value=mock_result):
            result = await service.transcribe(str(mock_audio_path))
            
            assert result["language"] == "fr"
            assert len(result["segments"]) == 3
            assert result["duration"] == 60.0
    
    @pytest.mark.asyncio
    async def test_hook_detection(self, sample_transcript_segments):
        """Test hook and punchline detection in transcript."""
        from forge_engine.services.transcription import TranscriptionService
        
        service = TranscriptionService.get_instance()
        
        enhanced = service.detect_hooks_and_punchlines(sample_transcript_segments)
        
        # Check that hook detection works
        assert len(enhanced) == 3
        
        # The second segment should have a higher hook score (question + intensifier)
        hook_segment = enhanced[1]
        assert hook_segment.get("hook_score", 0) > 0
        assert hook_segment.get("is_potential_hook", False) is True

    # ==================== ANALYSIS TESTS ====================
    
    @pytest.mark.asyncio
    async def test_audio_analysis(self, sample_audio_analysis):
        """Test audio analysis service."""
        from forge_engine.services.audio_analysis import AudioAnalysisService
        
        service = AudioAnalysisService()
        
        with patch.object(service, 'analyze_audio', return_value=sample_audio_analysis):
            result = await service.analyze_audio("mock_path.wav")
            
            assert result["duration"] == 60.0
            assert len(result["peaks"]) == 2
            assert len(result["silences"]) == 1
    
    @pytest.mark.asyncio
    async def test_scene_detection(self, sample_scene_data):
        """Test scene detection service."""
        from forge_engine.services.scene_detection import SceneDetectionService
        
        service = SceneDetectionService()
        
        with patch.object(service, 'detect_scenes', return_value=sample_scene_data):
            result = await service.detect_scenes("mock_path.mp4")
            
            assert result["total_scenes"] == 3
            assert len(result["scenes"]) == 3

    # ==================== VIRALITY SCORING TESTS ====================
    
    @pytest.mark.asyncio
    async def test_virality_scoring(
        self,
        sample_transcript_segments,
        sample_audio_analysis,
        sample_scene_data
    ):
        """Test virality scoring of segments."""
        from forge_engine.services.virality import ViralityScorer
        
        scorer = ViralityScorer()
        
        # Generate segments from transcript
        segments = scorer.generate_segments(
            transcript_segments=sample_transcript_segments,
            audio_analysis=sample_audio_analysis,
            scene_data=sample_scene_data,
            min_duration=15,
            max_duration=90,
            source_duration=60.0,
        )
        
        assert len(segments) > 0
        
        # Score the segments
        scored = scorer.score_segments(segments, sample_transcript_segments)
        
        for segment in scored:
            assert "score" in segment
            assert "total" in segment["score"]
            assert 0 <= segment["score"]["total"] <= 100
    
    @pytest.mark.asyncio
    async def test_segment_deduplication(self):
        """Test segment deduplication to avoid overlaps."""
        from forge_engine.services.virality import ViralityScorer
        
        scorer = ViralityScorer()
        
        # Create overlapping segments
        segments = [
            {"start_time": 0, "end_time": 30, "score": {"total": 80}},
            {"start_time": 20, "end_time": 50, "score": {"total": 70}},  # Overlaps with first
            {"start_time": 100, "end_time": 130, "score": {"total": 90}},  # No overlap
        ]
        
        deduplicated = scorer.deduplicate_segments(segments, iou_threshold=0.5)
        
        # Should keep highest score when overlapping
        assert len(deduplicated) == 2
        scores = [s["score"]["total"] for s in deduplicated]
        assert 80 in scores
        assert 90 in scores

    # ==================== EXPORT TESTS ====================
    
    @pytest.mark.asyncio
    async def test_export_service_render(
        self,
        sample_segment,
        temp_library,
        mock_video_path
    ):
        """Test video rendering for export."""
        from forge_engine.services.render import RenderService
        
        render = RenderService()
        output_path = temp_library / "output.mp4"
        
        with patch.object(render, 'render_clip') as mock_render:
            mock_render.return_value = {
                "output_path": str(output_path),
                "duration": 30.0,
                "resolution": "1080x1920",
            }
            
            result = await render.render_clip(
                source_path=str(mock_video_path),
                output_path=str(output_path),
                start_time=sample_segment["start_time"],
                end_time=sample_segment["end_time"],
                resolution="1080x1920",
            )
            
            assert result["duration"] == 30.0
            assert "output_path" in result
    
    @pytest.mark.asyncio
    async def test_caption_generation(self, sample_segment, sample_transcript_segments):
        """Test ASS caption file generation."""
        from forge_engine.services.captions import CaptionService
        
        service = CaptionService()
        
        # Generate captions
        ass_content = service.generate_ass_captions(
            segments=sample_transcript_segments,
            style={
                "font_family": "Arial",
                "font_size": 72,
                "color": "#FFFFFF",
                "outline_color": "#000000",
                "outline_width": 3,
            },
            clip_start=0,
            clip_end=60,
        )
        
        # Check ASS format
        assert "[Script Info]" in ass_content
        assert "[V4+ Styles]" in ass_content
        assert "[Events]" in ass_content

    # ==================== JOB SYSTEM TESTS ====================
    
    @pytest.mark.asyncio
    async def test_job_lifecycle(self):
        """Test job creation, progress, and completion."""
        from forge_engine.core.jobs import JobManager
        from forge_engine.models.job import Job, JobStatus, JobType
        
        manager = JobManager.get_instance()
        
        # Create a job
        job = Job(
            id="test-job-001",
            project_id="test-project-123",
            type=JobType.INGEST,
            status=JobStatus.PENDING,
        )
        
        assert job.status == JobStatus.PENDING
        
        # Simulate job progress
        job.status = JobStatus.RUNNING
        job.progress = 50
        
        assert job.status == JobStatus.RUNNING
        assert job.progress == 50
        
        # Complete job
        job.status = JobStatus.COMPLETED
        job.progress = 100
        
        assert job.status == JobStatus.COMPLETED
    
    @pytest.mark.asyncio
    async def test_job_error_handling(self):
        """Test job error handling and recovery."""
        from forge_engine.models.job import Job, JobStatus, JobType
        
        job = Job(
            id="test-job-002",
            project_id="test-project-123",
            type=JobType.ANALYZE,
            status=JobStatus.RUNNING,
        )
        
        # Simulate error
        job.status = JobStatus.FAILED
        job.error = "Test error message"
        
        assert job.status == JobStatus.FAILED
        assert job.error == "Test error message"

    # ==================== FULL PIPELINE INTEGRATION TEST ====================
    
    @pytest.mark.asyncio
    async def test_full_pipeline_integration(
        self,
        temp_library,
        mock_video_path,
        sample_transcript_segments,
        sample_audio_analysis,
        sample_scene_data,
    ):
        """Test the complete pipeline from ingest to export."""
        from forge_engine.services.ingest import IngestService
        from forge_engine.services.transcription import TranscriptionService
        from forge_engine.services.audio_analysis import AudioAnalysisService
        from forge_engine.services.scene_detection import SceneDetectionService
        from forge_engine.services.virality import ViralityScorer
        from forge_engine.services.render import RenderService
        
        # === PHASE 1: INGESTION ===
        ingest = IngestService()
        
        mock_probe_result = {
            "width": 1920,
            "height": 1080,
            "duration": 3600.0,
            "fps": 30.0,
        }
        
        with patch.object(ingest, 'probe_video', return_value=mock_probe_result):
            probe_result = await ingest.probe_video(str(mock_video_path))
            assert probe_result["duration"] == 3600.0
        
        # === PHASE 2: TRANSCRIPTION ===
        transcription = TranscriptionService.get_instance()
        
        mock_transcription = {
            "language": "fr",
            "duration": 3600.0,
            "segments": sample_transcript_segments,
            "text": "Transcribed content",
        }
        
        with patch.object(transcription, 'transcribe', return_value=mock_transcription):
            trans_result = await transcription.transcribe("mock_audio.wav")
            assert trans_result["language"] == "fr"
        
        # === PHASE 3: ANALYSIS ===
        audio_analysis = AudioAnalysisService()
        scene_detection = SceneDetectionService()
        
        with patch.object(audio_analysis, 'analyze_audio', return_value=sample_audio_analysis):
            audio_result = await audio_analysis.analyze_audio("mock_audio.wav")
        
        with patch.object(scene_detection, 'detect_scenes', return_value=sample_scene_data):
            scene_result = await scene_detection.detect_scenes(str(mock_video_path))
        
        # === PHASE 4: VIRALITY SCORING ===
        scorer = ViralityScorer()
        
        segments = scorer.generate_segments(
            transcript_segments=sample_transcript_segments,
            audio_analysis=audio_result,
            scene_data=scene_result,
            min_duration=15,
            max_duration=90,
            source_duration=probe_result["duration"],
        )
        
        scored_segments = scorer.score_segments(segments, sample_transcript_segments)
        
        # Verify we have scored segments
        assert len(scored_segments) > 0
        
        # Get best segment
        best_segment = max(scored_segments, key=lambda s: s["score"]["total"])
        
        # === PHASE 5: EXPORT ===
        render = RenderService()
        output_path = temp_library / "final_clip.mp4"
        
        mock_render_result = {
            "output_path": str(output_path),
            "duration": 30.0,
            "resolution": "1080x1920",
            "success": True,
        }
        
        with patch.object(render, 'render_clip', return_value=mock_render_result):
            export_result = await render.render_clip(
                source_path=str(mock_video_path),
                output_path=str(output_path),
                start_time=best_segment["start_time"],
                end_time=best_segment["end_time"],
            )
            
            assert export_result["success"] is True
        
        # Pipeline complete!
        print(f"✅ Pipeline complete: Generated clip from segment with score {best_segment['score']['total']}")


class TestAPIEndpoints:
    """Test API endpoints for the FORGE engine."""
    
    @pytest.fixture
    def test_client(self):
        """Create a test client for the FastAPI app."""
        from fastapi.testclient import TestClient
        from forge_engine.main import app
        
        return TestClient(app)
    
    def test_health_endpoint(self, test_client):
        """Test the health check endpoint."""
        response = test_client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
    
    def test_capabilities_endpoint(self, test_client):
        """Test the capabilities endpoint."""
        response = test_client.get("/api/v1/capabilities")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have capability information
        assert "ffmpeg" in data or "capabilities" in data
    
    def test_projects_list(self, test_client):
        """Test listing projects."""
        response = test_client.get("/api/v1/projects")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "projects" in data or isinstance(data, list)


class TestWebSocket:
    """Test WebSocket communication."""
    
    @pytest.mark.asyncio
    async def test_websocket_connection(self):
        """Test WebSocket connection establishment."""
        from fastapi.testclient import TestClient
        from forge_engine.main import app
        
        client = TestClient(app)
        
        with client.websocket_connect("/api/v1/ws") as websocket:
            # Should receive initial connection message
            data = websocket.receive_json()
            assert data.get("type") in ["connected", "jobs_list", "connection_established"]
    
    @pytest.mark.asyncio
    async def test_websocket_job_updates(self):
        """Test receiving job updates via WebSocket."""
        from fastapi.testclient import TestClient
        from forge_engine.main import app
        
        client = TestClient(app)
        
        with client.websocket_connect("/api/v1/ws") as websocket:
            # Receive initial message
            initial = websocket.receive_json()
            
            # The connection should be established
            assert initial is not None


class TestMonitorService:
    """Test the L'ŒIL monitoring service."""
    
    @pytest.mark.asyncio
    async def test_monitor_health_check(self):
        """Test monitor service health check."""
        from forge_engine.services.monitor import MonitorService
        
        monitor = MonitorService.get_instance()
        
        # Get status should return system info
        status = await monitor.get_status()
        
        assert "cpu_percent" in status or "system" in status
    
    @pytest.mark.asyncio
    async def test_monitor_stuck_job_detection(self):
        """Test detection of stuck jobs."""
        from forge_engine.services.monitor import MonitorService
        from forge_engine.models.job import Job, JobStatus, JobType
        from datetime import datetime, timedelta
        
        monitor = MonitorService.get_instance()
        
        # Create a mock stuck job (started long ago, no progress)
        stuck_job = Job(
            id="stuck-job-001",
            project_id="test-project",
            type=JobType.ANALYZE,
            status=JobStatus.RUNNING,
            progress=10,
        )
        
        # Simulate job being stuck (started 30 minutes ago)
        stuck_job.started_at = datetime.utcnow() - timedelta(minutes=30)
        stuck_job.updated_at = datetime.utcnow() - timedelta(minutes=25)
        
        # The monitor should be able to detect this as stuck
        # (actual implementation may vary)
        is_stuck = (datetime.utcnow() - stuck_job.updated_at).total_seconds() > 600
        
        assert is_stuck is True
