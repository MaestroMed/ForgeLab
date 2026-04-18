"""Advanced Audio Analysis API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from forge_engine.services.audio_analysis import AudioAnalyzer

router = APIRouter()


class AudioAnalyzeRequest(BaseModel):
    """Request to analyze audio."""
    audio_path: str


class AudioEventResponse(BaseModel):
    """Audio event in response."""
    event_type: str
    start_time: float
    end_time: float
    confidence: float
    viral_score: float


class AudioAnalyzeResponse(BaseModel):
    """Audio analysis response."""
    duration: float
    average_energy: float
    energy_variance: float
    speech_rate_estimate: float
    events: List[AudioEventResponse]
    peaks: List[Dict[str, Any]]
    silences: List[Dict[str, Any]]
    summary: Dict[str, Any]


@router.get("/status")
async def get_audio_status():
    """Check if advanced audio analysis is available."""
    service = AudioAnalyzer.get_instance()
    return {
        "available": service.is_advanced_available(),
        "sample_rate": service.sample_rate
    }


@router.post("/analyze", response_model=AudioAnalyzeResponse)
async def analyze_audio(request: AudioAnalyzeRequest):
    """Analyze audio file for events and characteristics."""
    service = AudioAnalyzer.get_instance()
    
    result = await service.analyze(request.audio_path)
    
    if not isinstance(result, dict) and hasattr(result, 'events'):
        # It's an AudioAnalysisResult object
        return AudioAnalyzeResponse(
            duration=result.duration,
            average_energy=result.average_energy,
            energy_variance=result.energy_variance,
            speech_rate_estimate=result.speech_rate_estimate,
            events=[
                AudioEventResponse(
                    event_type=e.event_type.value,
                    start_time=e.start_time,
                    end_time=e.end_time,
                    confidence=e.confidence,
                    viral_score=e.viral_score
                )
                for e in result.events
            ],
            peaks=result.peaks,
            silences=result.silences,
            summary=result.summary
        )
    else:
        # Fallback dict response
        return AudioAnalyzeResponse(
            duration=0,
            average_energy=0,
            energy_variance=0,
            speech_rate_estimate=0,
            events=[],
            peaks=result.get("peaks", []),
            silences=result.get("silences", []),
            summary={}
        )


@router.post("/segment-events")
async def get_segment_events(
    audio_path: str,
    start_time: float,
    end_time: float
):
    """Get audio events for a specific segment."""
    service = AudioAnalyzer.get_instance()
    
    result = await service.analyze(audio_path)
    
    if not hasattr(result, 'events'):
        return {
            "audio_event_score": 0,
            "audio_tags": [],
            "event_count": 0
        }
    
    score_data = service.get_events_for_segment(result, start_time, end_time)
    return score_data


@router.get("/event-types")
async def list_event_types():
    """List all detectable audio event types."""
    from forge_engine.services.audio_analysis import AudioEventType
    
    return {
        "event_types": [
            {
                "type": e.value,
                "viral_score": AudioAnalyzer.EVENT_VIRAL_SCORES.get(e, 0)
            }
            for e in AudioEventType
        ]
    }
