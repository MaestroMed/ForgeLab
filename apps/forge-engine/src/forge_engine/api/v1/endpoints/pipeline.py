"""One-click pipeline endpoints.

Thin HTTP surface around :class:`PipelineOrchestrator`. Exposes preset
listing, kick-off from URL or file, run listing, and single-run status.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class StartPipelineRequest(BaseModel):
    source_url: str | None = None
    source_file: str | None = None
    preset_id: str = "tiktok_quick"
    channel_name: str | None = None


@router.get("/presets")
async def list_presets() -> dict:
    """List available pipeline presets."""
    from forge_engine.services.pipeline_orchestrator import BUILTIN_PRESETS

    return {
        "presets": [
            {
                "id": pid,
                "name": p.name,
                "platform": p.platform,
                "target_count": p.target_count,
                "min_score": p.min_score,
                "min_duration": p.min_duration,
                "max_duration": p.max_duration,
                "schedule_publish": p.schedule_publish,
            }
            for pid, p in BUILTIN_PRESETS.items()
        ]
    }


@router.post("/start")
async def start_pipeline(request: StartPipelineRequest) -> dict:
    """Start a one-click pipeline run."""
    if not request.source_url and not request.source_file:
        raise HTTPException(
            status_code=400, detail="source_url or source_file required"
        )

    from forge_engine.services.pipeline_orchestrator import PipelineOrchestrator

    orchestrator = PipelineOrchestrator.get_instance()

    if request.source_url:
        run_id = await orchestrator.start_from_url(
            url=request.source_url,
            preset_id=request.preset_id,
            channel_name=request.channel_name,
        )
    else:
        run_id = await orchestrator.start_from_file(
            file_path=request.source_file or "",
            preset_id=request.preset_id,
            channel_name=request.channel_name,
        )
    return {"run_id": run_id, "status": "started"}


@router.get("/runs")
async def list_runs() -> dict:
    """List pipeline runs."""
    from forge_engine.services.pipeline_orchestrator import PipelineOrchestrator

    orchestrator = PipelineOrchestrator.get_instance()
    runs = orchestrator.list_runs()
    return {
        "runs": [
            {
                "id": r.id,
                "stage": r.stage,
                "progress": r.progress,
                "message": r.message,
                "error": r.error,
                "project_id": r.created_project_id,
                "exported_count": len(r.exported_artifacts),
                "published_count": len(r.published_schedule_ids),
                "preset_name": r.preset.name,
            }
            for r in runs
        ]
    }


@router.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict:
    from forge_engine.services.pipeline_orchestrator import PipelineOrchestrator

    orchestrator = PipelineOrchestrator.get_instance()
    run = orchestrator.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": run.id,
        "stage": run.stage,
        "progress": run.progress,
        "message": run.message,
        "error": run.error,
        "project_id": run.created_project_id,
        "exported_artifacts": run.exported_artifacts,
        "published_schedule_ids": run.published_schedule_ids,
        "preset": {
            "id": run.preset.name.lower().replace(" ", "_"),
            "name": run.preset.name,
            "platform": run.preset.platform,
        },
    }
