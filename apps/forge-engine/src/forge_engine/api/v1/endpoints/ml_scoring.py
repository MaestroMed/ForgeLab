"""ML Scoring API endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from forge_engine.services.ml_scoring import (
    MLScoringService,
    SegmentFeatures,
)

router = APIRouter()


class PredictRequest(BaseModel):
    """Request to predict score for a segment."""
    segment: dict[str, Any]
    audio_data: dict[str, Any] | None = None
    emotion_data: dict[str, Any] | None = None
    llm_scores: dict[str, Any] | None = None
    total_duration: float = 0
    blend_with_heuristic: bool = True


class FeedbackRequest(BaseModel):
    """Request to add user feedback."""
    segment: dict[str, Any]
    rating: float  # 0-10
    audio_data: dict[str, Any] | None = None
    emotion_data: dict[str, Any] | None = None
    total_duration: float = 0


class TrainRequest(BaseModel):
    """Request to train the model."""
    force: bool = False


@router.get("/status")
async def get_ml_status():
    """Get ML scoring status and model info."""
    service = MLScoringService.get_instance()

    return {
        "available": service.is_available(),
        "model_trained": service.is_model_trained(),
        "training_examples": service.get_training_data_count(),
        "can_train": service.can_train(),
        "min_examples_required": service.MIN_TRAINING_EXAMPLES,
        "model_info": service.get_model_info()
    }


@router.post("/predict")
async def predict_score(request: PredictRequest):
    """Predict viral score using ML model."""
    service = MLScoringService.get_instance()

    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="ML scoring not available (scikit-learn not installed)"
        )

    if not service.is_model_trained():
        return {
            "score": None,
            "ml_enhanced": False,
            "message": "Model not trained yet. Add more feedback examples."
        }

    result = await service.score_segment_async(
        segment=request.segment,
        audio_data=request.audio_data,
        emotion_data=request.emotion_data,
        llm_scores=request.llm_scores,
        total_duration=request.total_duration,
        blend_with_heuristic=request.blend_with_heuristic
    )

    return result


@router.post("/feedback")
async def add_feedback(request: FeedbackRequest):
    """Add user feedback for ML training."""
    service = MLScoringService.get_instance()

    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="ML scoring not available"
        )

    service.add_feedback(
        segment=request.segment,
        rating=request.rating,
        audio_data=request.audio_data,
        emotion_data=request.emotion_data,
        total_duration=request.total_duration
    )

    return {
        "success": True,
        "training_examples": service.get_training_data_count(),
        "can_train": service.can_train()
    }


@router.post("/train")
async def train_model(request: TrainRequest):
    """Train the ML model on collected feedback."""
    service = MLScoringService.get_instance()

    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="ML scoring not available"
        )

    if not request.force and not service.can_train():
        return {
            "success": False,
            "message": f"Need at least {service.MIN_TRAINING_EXAMPLES} examples, have {service.get_training_data_count()}"
        }

    metadata = await service.train_model(force=request.force)

    if metadata is None:
        raise HTTPException(status_code=500, detail="Training failed")

    return {
        "success": True,
        "model_info": {
            "version": metadata.version,
            "training_examples": metadata.training_examples,
            "cv_score": metadata.cv_score,
            "trained_at": metadata.trained_at,
            "top_features": dict(
                sorted(
                    metadata.feature_importances.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:5]
            )
        }
    }


@router.get("/features")
async def list_features():
    """List all ML features used for scoring."""
    return {
        "features": SegmentFeatures.feature_names(),
        "count": len(SegmentFeatures.feature_names())
    }
