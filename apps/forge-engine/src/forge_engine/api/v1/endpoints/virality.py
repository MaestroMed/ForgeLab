"""Virality Prediction API endpoints."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from forge_engine.services.virality_predictor import ViralityPredictor

router = APIRouter()


class PredictViralityRequest(BaseModel):
    """Request to predict virality."""
    segment: dict[str, Any]
    include_suggestions: bool = True


class BatchPredictRequest(BaseModel):
    """Request to predict virality for multiple segments."""
    segments: list[dict[str, Any]]
    sort_by_score: bool = True
    limit: int | None = None


@router.get("/status")
async def get_virality_status():
    """Get virality prediction status."""
    service = ViralityPredictor.get_instance()
    return {
        "available": service.is_available(),
        "ml_model_trained": service.is_ml_model_trained(),
        "features_used": service.get_features_used()
    }


@router.post("/predict")
async def predict_virality(request: PredictViralityRequest):
    """Predict virality score for a segment."""
    service = ViralityPredictor.get_instance()

    result = await service.predict(
        segment=request.segment,
        include_suggestions=request.include_suggestions
    )

    return result


@router.post("/batch")
async def predict_batch(request: BatchPredictRequest):
    """Predict virality for multiple segments."""
    service = ViralityPredictor.get_instance()

    results = await service.predict_batch(
        segments=request.segments
    )

    # Sort if requested
    if request.sort_by_score:
        results.sort(key=lambda x: x.get("score", 0), reverse=True)

    # Limit if requested
    if request.limit:
        results = results[:request.limit]

    return {
        "predictions": results,
        "count": len(results)
    }


@router.get("/top-features")
async def get_top_features():
    """Get the most important features for virality."""
    service = ViralityPredictor.get_instance()

    return {
        "features": service.get_feature_importances(),
        "description": "Features ranked by importance in predicting virality"
    }


@router.post("/analyze-potential")
async def analyze_potential(
    transcript: str,
    duration: float,
    has_face: bool = True,
    audio_energy: float = 0.5
):
    """Quick analysis of viral potential from basic inputs."""
    service = ViralityPredictor.get_instance()

    # Build minimal segment
    segment = {
        "transcript": transcript,
        "duration": duration,
        "score": {
            "total": 50,
            "hook_strength": 0,
            "content_score": 0
        }
    }

    result = await service.predict(
        segment=segment,
        include_suggestions=True
    )

    return {
        "potential_score": result.get("score", 0),
        "confidence": result.get("confidence", 0),
        "suggestions": result.get("suggestions", []),
        "quick_analysis": True
    }
