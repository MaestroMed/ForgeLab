"""Dictionary management endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from ....services.dictionary import get_dictionary_service

router = APIRouter(prefix="/dictionaries", tags=["dictionaries"])


class ApplyCorrectionsRequest(BaseModel):
    """Request to apply dictionary corrections to text."""
    text: str
    dictionary: str


@router.get("")
async def list_dictionaries() -> dict:
    """List all available dictionaries."""
    service = get_dictionary_service()
    dictionaries = service.list_dictionaries()
    
    return {
        "success": True,
        "data": dictionaries,
        "count": len(dictionaries),
    }


@router.get("/{dictionary_id}")
async def get_dictionary(dictionary_id: str) -> dict:
    """Get dictionary details."""
    service = get_dictionary_service()
    dictionary = service.get_dictionary(dictionary_id)
    
    if not dictionary:
        raise HTTPException(status_code=404, detail=f"Dictionary '{dictionary_id}' not found")
    
    return {
        "success": True,
        "data": {
            "id": dictionary_id,
            "name": dictionary.get("name", dictionary_id),
            "description": dictionary.get("description", ""),
            "author": dictionary.get("author", ""),
            "hotwords": dictionary.get("hotwords", []),
            "corrections_count": len(dictionary.get("corrections", {})),
            "whisper_prompt": dictionary.get("whisper_prompt", ""),
        },
    }


@router.post("/apply")
async def apply_corrections(request: ApplyCorrectionsRequest) -> dict:
    """Apply dictionary corrections to text."""
    service = get_dictionary_service()
    
    if not service.get_dictionary(request.dictionary):
        raise HTTPException(status_code=404, detail=f"Dictionary '{request.dictionary}' not found")
    
    corrected = service.apply_corrections(request.text, request.dictionary)
    
    return {
        "success": True,
        "original": request.text,
        "corrected": corrected,
        "dictionary": request.dictionary,
    }


@router.post("/reload")
async def reload_dictionaries() -> dict:
    """Reload all dictionaries from disk."""
    service = get_dictionary_service()
    service.reload()
    dictionaries = service.list_dictionaries()
    
    return {
        "success": True,
        "message": "Dictionaries reloaded",
        "count": len(dictionaries),
    }
