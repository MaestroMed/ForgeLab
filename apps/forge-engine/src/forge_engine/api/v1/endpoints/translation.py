"""Translation API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from forge_engine.services.translation import TranslationService

router = APIRouter()


class TranslateTextRequest(BaseModel):
    """Request to translate text."""
    text: str
    source_lang: str = "fr"
    target_lang: str = "en"


class TranslateSubtitlesRequest(BaseModel):
    """Request to translate subtitles."""
    words: List[Dict[str, Any]]  # List of word timings
    source_lang: str = "fr"
    target_lang: str = "en"
    preserve_timing: bool = True


class TranslateBatchRequest(BaseModel):
    """Request to translate multiple texts."""
    texts: List[str]
    source_lang: str = "fr"
    target_lang: str = "en"


@router.get("/status")
async def get_translation_status():
    """Check if translation is available."""
    service = TranslationService.get_instance()
    return {
        "available": service.is_available(),
        "supported_languages": service.get_supported_languages()
    }


@router.get("/languages")
async def list_languages():
    """List supported languages."""
    service = TranslationService.get_instance()
    return {
        "languages": service.get_supported_languages()
    }


@router.post("/text")
async def translate_text(request: TranslateTextRequest):
    """Translate a single text."""
    service = TranslationService.get_instance()
    
    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Translation service not available"
        )
    
    translated = await service.translate(
        text=request.text,
        source_lang=request.source_lang,
        target_lang=request.target_lang
    )
    
    return {
        "original": request.text,
        "translated": translated,
        "source_lang": request.source_lang,
        "target_lang": request.target_lang
    }


@router.post("/subtitles")
async def translate_subtitles(request: TranslateSubtitlesRequest):
    """Translate subtitles while preserving timing."""
    service = TranslationService.get_instance()
    
    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Translation service not available"
        )
    
    translated_words = await service.translate_subtitles(
        words=request.words,
        source_lang=request.source_lang,
        target_lang=request.target_lang,
        preserve_timing=request.preserve_timing
    )
    
    return {
        "words": translated_words,
        "source_lang": request.source_lang,
        "target_lang": request.target_lang,
        "word_count": len(translated_words)
    }


@router.post("/batch")
async def translate_batch(request: TranslateBatchRequest):
    """Translate multiple texts at once."""
    service = TranslationService.get_instance()
    
    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Translation service not available"
        )
    
    translations = await service.translate_batch(
        texts=request.texts,
        source_lang=request.source_lang,
        target_lang=request.target_lang
    )
    
    return {
        "translations": [
            {
                "original": orig,
                "translated": trans
            }
            for orig, trans in zip(request.texts, translations)
        ],
        "source_lang": request.source_lang,
        "target_lang": request.target_lang
    }
