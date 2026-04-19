"""Emotion Detection API endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from forge_engine.services.emotion_detection import EmotionDetectionService

router = APIRouter()


class EmotionAnalyzeRequest(BaseModel):
    """Request to analyze emotions in a video segment."""
    video_path: str
    start_time: float = 0
    end_time: float | None = None
    duration: float


class EmotionAnalyzeResponse(BaseModel):
    """Emotion analysis response."""
    available: bool
    backend: str | None = None
    summary: dict[str, Any] | None = None
    timeline: list[dict[str, Any]] | None = None
    segments: list[dict[str, Any]] | None = None


@router.get("/status")
async def get_emotion_status():
    """Check if emotion detection is available."""
    service = EmotionDetectionService.get_instance()
    return {
        "available": service.is_available(),
        "backend": service.backend
    }


@router.post("/analyze", response_model=EmotionAnalyzeResponse)
async def analyze_emotions(request: EmotionAnalyzeRequest):
    """Analyze emotions in a video segment."""
    service = EmotionDetectionService.get_instance()

    if not service.is_available():
        return EmotionAnalyzeResponse(
            available=False,
            backend=None
        )

    result = await service.analyze_video(
        video_path=request.video_path,
        duration=request.duration,
        start_time=request.start_time,
        end_time=request.end_time
    )

    if result is None:
        raise HTTPException(status_code=500, detail="Emotion analysis failed")

    return EmotionAnalyzeResponse(
        available=True,
        backend=result.backend_used,
        summary=result.summary,
        timeline=result.timeline,
        segments=[
            {
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "dominant_emotion": seg.dominant_emotion,
                "emotion_distribution": seg.emotion_distribution,
                "peak_emotions": seg.peak_emotions,
                "face_detection_rate": seg.face_detection_rate,
                "average_confidence": seg.average_confidence
            }
            for seg in result.segments
        ]
    )


@router.post("/segment-score")
async def get_segment_emotion_score(
    video_path: str,
    start_time: float,
    end_time: float,
    duration: float
):
    """Get emotion-based viral score for a segment."""
    service = EmotionDetectionService.get_instance()

    if not service.is_available():
        return {
            "emotion_score": 0,
            "emotion_tags": [],
            "available": False
        }

    result = await service.analyze_video(
        video_path=video_path,
        duration=duration,
        start_time=start_time,
        end_time=end_time
    )

    if result is None:
        return {
            "emotion_score": 0,
            "emotion_tags": [],
            "available": True,
            "error": "Analysis failed"
        }

    score_data = service.get_emotion_score_for_segment(
        result, start_time, end_time
    )
    score_data["available"] = True

    return score_data
