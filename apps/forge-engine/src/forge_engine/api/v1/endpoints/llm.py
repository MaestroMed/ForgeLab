"""LLM endpoints for AI-powered content analysis and generation."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response Models
class LLMStatusResponse(BaseModel):
    available: bool
    model: str | None = None
    message: str


class ScoreSegmentRequest(BaseModel):
    transcript: str
    duration: float = 60.0
    context: str | None = None


class LLMScoreResponse(BaseModel):
    success: bool
    humor_score: float = 0
    surprise_score: float = 0
    hook_score: float = 0
    clarity_score: float = 0
    engagement_score: float = 0
    reasoning: str = ""
    tags: list[str] = []


class GenerateContentRequest(BaseModel):
    transcript: str
    tags: list[str] = []
    platform: str = "tiktok"


class GeneratedContentResponse(BaseModel):
    success: bool
    titles: list[str] = []
    description: str = ""
    hashtags: list[str] = []
    hook_suggestion: str | None = None


class AnalyzeHookRequest(BaseModel):
    opening_text: str
    full_transcript: str


@router.get("/status", response_model=LLMStatusResponse)
async def get_llm_status():
    """Check if local LLM (Ollama) is available."""
    try:
        from forge_engine.services.llm_local import LocalLLMService

        service = LocalLLMService.get_instance()
        available = await service.check_availability()

        return LLMStatusResponse(
            available=available,
            model=service._current_model if available else None,
            message="LLM ready" if available else "Ollama not running or no models available"
        )
    except Exception as e:
        logger.error(f"Error checking LLM status: {e}")
        return LLMStatusResponse(
            available=False,
            model=None,
            message=f"Error: {str(e)}"
        )


@router.post("/score", response_model=LLMScoreResponse)
async def score_segment_with_llm(request: ScoreSegmentRequest):
    """Score a segment using LLM analysis."""
    try:
        from forge_engine.services.llm_local import LocalLLMService

        service = LocalLLMService.get_instance()
        if not await service.check_availability():
            raise HTTPException(status_code=503, detail="LLM not available")

        result = await service.score_segment_context(
            transcript=request.transcript,
            duration=request.duration,
            context=request.context
        )

        if result is None:
            return LLMScoreResponse(success=False)

        return LLMScoreResponse(
            success=True,
            humor_score=result.humor_score,
            surprise_score=result.surprise_score,
            hook_score=result.hook_score,
            clarity_score=result.clarity_score,
            engagement_score=result.engagement_score,
            reasoning=result.reasoning,
            tags=result.tags
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scoring segment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-content", response_model=GeneratedContentResponse)
async def generate_content(request: GenerateContentRequest):
    """Generate viral titles, descriptions, and hashtags for a clip."""
    try:
        from forge_engine.services.llm_local import LocalLLMService

        service = LocalLLMService.get_instance()
        if not await service.check_availability():
            raise HTTPException(status_code=503, detail="LLM not available")

        result = await service.generate_content(
            transcript=request.transcript,
            segment_tags=request.tags,
            platform=request.platform
        )

        if result is None:
            return GeneratedContentResponse(success=False)

        return GeneratedContentResponse(
            success=True,
            titles=result.titles,
            description=result.description,
            hashtags=result.hashtags,
            hook_suggestion=result.hook_suggestion
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-hook")
async def analyze_hook(request: AnalyzeHookRequest):
    """Analyze hook quality and get suggestions."""
    try:
        from forge_engine.services.llm_local import LocalLLMService

        service = LocalLLMService.get_instance()
        if not await service.check_availability():
            raise HTTPException(status_code=503, detail="LLM not available")

        result = await service.analyze_hook_quality(
            opening_text=request.opening_text,
            full_transcript=request.full_transcript
        )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing hook: {e}")
        raise HTTPException(status_code=500, detail=str(e))
