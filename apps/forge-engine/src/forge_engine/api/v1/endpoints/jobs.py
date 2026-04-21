"""Job endpoints."""


import asyncio

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from forge_engine.core.jobs import JobManager

router = APIRouter()


@router.get("")
async def list_jobs(project_id: str | None = Query(None)) -> dict:
    """List jobs, optionally filtered by project."""
    job_manager = JobManager.get_instance()

    if project_id:
        jobs = await job_manager.get_jobs_for_project(project_id)
    else:
        # Get all jobs from DB (last 100)
        jobs = await job_manager.get_all_jobs()

    return {"success": True, "data": [j.to_dict() for j in jobs]}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job status and progress."""
    job_manager = JobManager.get_instance()
    job = await job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {"success": True, "data": job.to_dict()}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict:
    """Cancel a job."""
    job_manager = JobManager.get_instance()
    cancelled = await job_manager.cancel_job(job_id)

    if not cancelled:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    return {"success": True, "data": {"cancelled": True}}


@router.post("/{job_id}/retry")
async def retry_job(job_id: str) -> dict:
    """Retry a failed or cancelled job."""
    job_manager = JobManager.get_instance()
    job = await job_manager.retry_job(job_id)

    if not job:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be retried (not found or not failed/cancelled)"
        )

    return {"success": True, "data": job.to_dict()}


@router.get("/{job_id}/logs")
async def get_job_logs(job_id: str, lines: int = Query(100, ge=1, le=500)) -> dict:
    """Return the last N buffered log lines for a job.

    Logs are kept in an in-memory ring buffer that is populated automatically
    while the job is running. After the job completes the buffer is preserved
    until the process restarts, so the UI can still fetch the tail.
    """
    manager = JobManager.get_instance()
    all_lines = manager.get_logs(job_id) if hasattr(manager, "get_logs") else []
    tail = all_lines[-lines:]
    return {
        "success": True,
        "data": {
            "job_id": job_id,
            "lines": tail,
            "count": len(tail),
            "total": len(all_lines),
        },
    }


@router.get("/{job_id}/stream-logs")
async def stream_job_logs(job_id: str):
    """SSE stream of log lines for a job.

    Pushes all existing lines on connect, then streams new lines as they
    arrive in the ring buffer. Max 1h of streaming per connection.
    """
    async def event_gen():
        manager = JobManager.get_instance()

        # Snapshot existing
        existing = []
        if hasattr(manager, "get_logs"):
            existing = manager.get_logs(job_id)
        for line in existing[-200:]:
            # SSE data lines can't contain newlines; split + encode safely
            for sub in line.split("\n"):
                yield f"data: {sub}\n"
            yield "\n"

        seen = len(existing)
        # Poll the ring buffer; it's in-memory so this is very cheap.
        # Cap the stream at 1 hour so stale connections don't accumulate.
        for _ in range(14400):  # 14400 * 0.25s = 1 hour
            await asyncio.sleep(0.25)
            if not hasattr(manager, "get_logs"):
                continue
            current = manager.get_logs(job_id)
            if len(current) > seen:
                for line in current[seen:]:
                    for sub in line.split("\n"):
                        yield f"data: {sub}\n"
                    yield "\n"
                seen = len(current)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/stats/summary")
async def get_jobs_stats() -> dict:
    """Get job statistics summary."""
    job_manager = JobManager.get_instance()
    stats = await job_manager.get_jobs_stats()

    return {
        "success": True,
        "data": {
            "stats": stats,
            "max_workers": job_manager._max_workers,
        }
    }


@router.post("/workers/config")
async def configure_workers(count: int = 2):
    """Configure the number of parallel job workers (1-4). Takes effect on next job."""
    manager = JobManager.get_instance()
    count = max(1, min(4, count))
    manager._max_workers = count
    return {"max_workers": count, "status": "configured"}






