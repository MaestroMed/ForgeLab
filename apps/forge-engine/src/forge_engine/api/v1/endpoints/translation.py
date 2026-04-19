"""Translation API endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from forge_engine.services.translation import TranslationService

router = APIRouter()


class TranslateTextRequest(BaseModel):
    """Request to translate text."""
    text: str
    source_lang: str = "fr"
    target_lang: str = "en"


class TranslateSubtitlesRequest(BaseModel):
    """Request to translate subtitles."""
    words: list[dict[str, Any]]  # List of word timings
    source_lang: str = "fr"
    target_lang: str = "en"
    preserve_timing: bool = True


class TranslateBatchRequest(BaseModel):
    """Request to translate multiple texts."""
    texts: list[str]
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
            for orig, trans in zip(request.texts, translations, strict=False)
        ],
        "source_lang": request.source_lang,
        "target_lang": request.target_lang
    }


class MultiTranslateRequest(BaseModel):
    """Request to translate to multiple languages at once."""
    words: list[dict]
    source_lang: str = "fr"
    target_langs: list[str] = ["en", "es", "pt"]


@router.post("/multi")
async def translate_multi(request: MultiTranslateRequest):
    """Translate subtitles to multiple languages in parallel."""
    from forge_engine.services.translation import TranslationService
    service = TranslationService.get_instance()

    if not request.target_langs:
        raise HTTPException(status_code=400, detail="At least one target language required")

    # Cap at 5 languages to avoid abuse
    target_langs = request.target_langs[:5]

    results = await service.translate_to_languages(
        words=request.words,
        source_lang=request.source_lang,
        target_langs=target_langs,
    )

    return {
        "results": {
            lang: {
                "words": [
                    {"word": seg.translated_text, "start": seg.start_time, "end": seg.end_time}
                    for seg in result.segments
                ] if result else [],
                "success": result is not None,
            }
            for lang, result in results.items()
        },
        "source_lang": request.source_lang,
        "languages_processed": len(results),
    }


@router.get("/supported")
async def get_supported_languages():
    """Get list of supported translation language pairs."""
    from forge_engine.services.translation import TranslationService
    service = TranslationService.get_instance()
    pairs = service.get_supported_pairs()
    # Deduplicate targets by source
    by_source: dict[str, list[str]] = {}
    for p in pairs:
        by_source.setdefault(p["source"], []).append(p["target"])
    return {"pairs": pairs, "by_source": by_source, "backend": "argos" if len(pairs) > 10 else "stub"}
