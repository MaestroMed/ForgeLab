"""FORGE Engine services."""

from forge_engine.services.ffmpeg import FFmpegService
from forge_engine.services.ingest import IngestService
from forge_engine.services.transcription import TranscriptionService


# Lazy imports for services requiring optional dependencies
def get_analysis_service():
    from forge_engine.services.analysis import AnalysisService
    return AnalysisService

def get_virality_scorer():
    from forge_engine.services.virality import ViralityScorer
    return ViralityScorer

def get_layout_engine():
    from forge_engine.services.layout import LayoutEngine
    return LayoutEngine

def get_caption_engine():
    from forge_engine.services.captions import CaptionEngine
    return CaptionEngine

def get_render_service():
    from forge_engine.services.render import RenderService
    return RenderService

def get_export_service():
    from forge_engine.services.export import ExportService
    return ExportService

def get_auto_params_service():
    from forge_engine.services.auto_params import AutoParamsService
    return AutoParamsService

def get_jump_cut_engine():
    from forge_engine.services.jump_cuts import JumpCutEngine
    return JumpCutEngine

def get_llm_service():
    from forge_engine.services.llm_local import LocalLLMService
    return LocalLLMService.get_instance()

async def check_llm_available():
    from forge_engine.services.llm_local import is_llm_available
    return await is_llm_available()

def get_emotion_service():
    from forge_engine.services.emotion_detection import EmotionDetectionService
    return EmotionDetectionService.get_instance()

def check_emotion_available():
    from forge_engine.services.emotion_detection import is_emotion_detection_available
    return is_emotion_detection_available()

def get_ml_scoring_service():
    from forge_engine.services.ml_scoring import MLScoringService
    return MLScoringService.get_instance()

def check_ml_scoring_available():
    from forge_engine.services.ml_scoring import is_ml_scoring_available
    return is_ml_scoring_available()

def get_audio_analyzer():
    from forge_engine.services.audio_analysis import AudioAnalyzer
    return AudioAnalyzer.get_instance()

def get_content_generation_service():
    from forge_engine.services.content_generation import ContentGenerationService
    return ContentGenerationService.get_instance()

__all__ = [
    "FFmpegService",
    "TranscriptionService",
    "IngestService",
    "get_analysis_service",
    "get_virality_scorer",
    "get_layout_engine",
    "get_caption_engine",
    "get_render_service",
    "get_export_service",
    "get_auto_params_service",
    "get_jump_cut_engine",
    "get_llm_service",
    "check_llm_available",
    "get_emotion_service",
    "check_emotion_available",
    "get_ml_scoring_service",
    "check_ml_scoring_available",
    "get_audio_analyzer",
    "get_content_generation_service",
]
