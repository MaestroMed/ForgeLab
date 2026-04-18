"""Content Generation API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from forge_engine.services.content_generation import ContentGenerationService

router = APIRouter()


class TitleRequest(BaseModel):
    """Request to generate titles."""
    transcript: str
    context: Optional[str] = None
    style: Optional[str] = None  # "viral", "professional", "funny", "dramatic"
    count: int = 5


class DescriptionRequest(BaseModel):
    """Request to generate description."""
    transcript: str
    title: Optional[str] = None
    platform: str = "youtube"  # "youtube", "tiktok", "instagram"
    max_length: int = 500


class HashtagRequest(BaseModel):
    """Request to generate hashtags."""
    transcript: str
    title: Optional[str] = None
    platform: str = "tiktok"
    count: int = 10


class FullContentRequest(BaseModel):
    """Request to generate all content at once."""
    transcript: str
    context: Optional[str] = None
    platform: str = "tiktok"


@router.get("/status")
async def get_content_status():
    """Check if content generation is available."""
    service = ContentGenerationService.get_instance()
    return {
        "available": service.is_available(),
        "llm_backend": "ollama" if service.is_available() else None
    }


@router.post("/title")
async def generate_title(request: TitleRequest):
    """Generate viral titles for content."""
    service = ContentGenerationService.get_instance()
    
    if not service.is_available():
        # Fallback titles without LLM
        return {
            "titles": [
                f"🔥 {request.transcript[:50]}...",
                f"Vous n'allez pas croire ce qui se passe...",
                f"Le moment où tout a changé",
                f"IL A VRAIMENT FAIT ÇA ?!",
                f"Cette réaction est ÉPIQUE"
            ][:request.count],
            "llm_generated": False
        }
    
    titles = await service.generate_titles(
        transcript=request.transcript,
        context=request.context,
        style=request.style,
        count=request.count
    )
    
    return {
        "titles": titles,
        "llm_generated": True
    }


@router.post("/description")
async def generate_description(request: DescriptionRequest):
    """Generate description for content."""
    service = ContentGenerationService.get_instance()
    
    if not service.is_available():
        # Fallback description
        preview = request.transcript[:200] if request.transcript else ""
        return {
            "description": f"🎮 {preview}...\n\n#gaming #viral #clip",
            "llm_generated": False
        }
    
    description = await service.generate_description(
        transcript=request.transcript,
        title=request.title,
        platform=request.platform,
        max_length=request.max_length
    )
    
    return {
        "description": description,
        "llm_generated": True
    }


@router.post("/hashtags")
async def generate_hashtags(request: HashtagRequest):
    """Generate hashtags for content."""
    service = ContentGenerationService.get_instance()
    
    if not service.is_available():
        # Fallback hashtags
        return {
            "hashtags": [
                "#gaming", "#viral", "#funny", "#clip", 
                "#streamer", "#twitch", "#youtube", "#fyp",
                "#pourtoi", "#reaction"
            ][:request.count],
            "llm_generated": False
        }
    
    hashtags = await service.generate_hashtags(
        transcript=request.transcript,
        title=request.title,
        platform=request.platform,
        count=request.count
    )
    
    return {
        "hashtags": hashtags,
        "llm_generated": True
    }


@router.post("/full")
async def generate_full_content(request: FullContentRequest):
    """Generate title, description, and hashtags at once."""
    service = ContentGenerationService.get_instance()
    
    # Generate all in parallel if LLM available
    if service.is_available():
        import asyncio
        
        titles_task = service.generate_titles(
            request.transcript, request.context, count=3
        )
        desc_task = service.generate_description(
            request.transcript, platform=request.platform
        )
        hashtags_task = service.generate_hashtags(
            request.transcript, platform=request.platform, count=10
        )
        
        titles, description, hashtags = await asyncio.gather(
            titles_task, desc_task, hashtags_task
        )
        
        return {
            "titles": titles,
            "description": description,
            "hashtags": hashtags,
            "llm_generated": True
        }
    else:
        # Fallback
        preview = request.transcript[:100] if request.transcript else ""
        return {
            "titles": [
                f"🔥 {preview}...",
                "Le moment INCROYABLE que vous devez voir",
                "Cette réaction est LÉGENDAIRE"
            ],
            "description": f"🎮 Regardez ce moment incroyable!\n\n{preview}...",
            "hashtags": ["#gaming", "#viral", "#clip", "#fyp", "#streamer"],
            "llm_generated": False
        }
