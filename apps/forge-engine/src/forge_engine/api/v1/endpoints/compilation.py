"""Compilation (Best-of) API endpoints."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from forge_engine.services.compilation import CompilationService

router = APIRouter()


class CreateCompilationRequest(BaseModel):
    """Request to create a best-of compilation."""
    project_id: str
    segment_ids: Optional[List[str]] = None  # If None, auto-select best
    max_duration: float = 60.0  # Max total duration in seconds
    min_segment_score: float = 60.0
    title: Optional[str] = None
    include_transitions: bool = True
    transition_type: str = "crossfade"  # "crossfade", "cut", "zoom"
    output_format: str = "9:16"


class CompilationStatusResponse(BaseModel):
    """Compilation job status."""
    job_id: str
    status: str
    progress: float
    output_path: Optional[str] = None
    error: Optional[str] = None


@router.get("/status")
async def get_compilation_status():
    """Check if compilation service is available."""
    service = CompilationService.get_instance()
    return {
        "available": service.is_available(),
        "max_segments": service.max_segments,
        "supported_formats": ["9:16", "16:9", "1:1"]
    }


@router.post("/create")
async def create_compilation(
    request: CreateCompilationRequest,
    background_tasks: BackgroundTasks
):
    """Create a best-of compilation from segments."""
    service = CompilationService.get_instance()
    
    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Compilation service not available"
        )
    
    # Start compilation job
    job_id = await service.create_compilation(
        project_id=request.project_id,
        segment_ids=request.segment_ids,
        max_duration=request.max_duration,
        min_segment_score=request.min_segment_score,
        title=request.title,
        include_transitions=request.include_transitions,
        transition_type=request.transition_type,
        output_format=request.output_format
    )
    
    return {
        "job_id": job_id,
        "status": "started",
        "message": "Compilation started in background"
    }


@router.get("/job/{job_id}")
async def get_compilation_job(job_id: str):
    """Get status of a compilation job."""
    service = CompilationService.get_instance()
    
    status = await service.get_job_status(job_id)
    
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return CompilationStatusResponse(**status)


@router.post("/auto-select")
async def auto_select_segments(
    project_id: str,
    max_duration: float = 60.0,
    min_score: float = 60.0,
    diversity_weight: float = 0.3
):
    """Auto-select best segments for a compilation."""
    service = CompilationService.get_instance()
    
    segments = await service.auto_select_segments(
        project_id=project_id,
        max_duration=max_duration,
        min_score=min_score,
        diversity_weight=diversity_weight
    )
    
    return {
        "segments": segments,
        "count": len(segments),
        "total_duration": sum(s.get("duration", 0) for s in segments)
    }


@router.delete("/job/{job_id}")
async def cancel_compilation(job_id: str):
    """Cancel a running compilation job."""
    service = CompilationService.get_instance()
    
    success = await service.cancel_job(job_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    
    return {"success": True, "message": "Compilation cancelled"}
