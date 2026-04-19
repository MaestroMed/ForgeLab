"""
Public API v2 — Clip Processing.

POST /v2/clips   Submit a video URL → get back a viral clip.
GET  /v2/clips/{job_id}  Poll status.

Authentication: Bearer token (JWT from /auth/login) or API key header X-API-Key.
"""

import logging
import uuid

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from forge_engine.core.database import get_db, async_session_maker

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Auth helper (API key lookup) ─────────────────────────────────────────────

async def get_user_by_api_key(api_key: str, db: AsyncSession) -> "User | None":
    """Look up user by API key."""
    try:
        from forge_engine.models.user import User
        result = await db.execute(select(User).where(User.api_key == api_key))
        return result.scalar_one_or_none()
    except Exception:
        return None


async def get_api_user(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Resolve user from X-API-Key header or Bearer JWT."""
    if x_api_key:
        user = await get_user_by_api_key(x_api_key, db)
        if user:
            return user

    if authorization and authorization.startswith("Bearer "):
        from forge_engine.core.auth import decode_token
        from forge_engine.models.user import User
        payload = decode_token(authorization[7:])
        if payload:
            result = await db.execute(select(User).where(User.id == payload["sub"]))
            user = result.scalar_one_or_none()
            if user:
                return user

    raise HTTPException(status_code=401, detail="Valid X-API-Key or Bearer token required")


# ── Schemas ─────────────────────────────────────────────────────────────────

class ClipRequest(BaseModel):
    """Submit a video for clip processing."""
    url: str                            # Video URL (YouTube, Twitch VOD, direct MP4, etc.)
    platform: str = "tiktok"           # Target platform
    max_clips: int = 3                 # Max clips to generate
    min_score: float = 60.0            # Minimum virality score filter
    webhook_url: str | None = None     # Override user's default webhook URL
    language: str = "fr"              # Transcript language hint


class ClipStatusResponse(BaseModel):
    job_id: str
    status: str                        # pending | running | completed | failed
    progress: float = 0.0
    clips: list[dict] = []
    error: str | None = None


# ── Background webhook delivery ──────────────────────────────────────────────

async def deliver_webhook(webhook_url: str, payload: dict) -> None:
    """Deliver a webhook notification (fire and forget)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(webhook_url, json=payload, headers={"Content-Type": "application/json", "X-Forge-Event": "clip.completed"})
            logger.info("Webhook delivered to %s: %s", webhook_url, resp.status_code)
    except Exception as e:
        logger.warning("Webhook delivery failed: %s", e)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=202)
async def submit_clip(
    request: ClipRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_api_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a video URL for viral clip generation.

    Returns immediately with a job_id. Poll GET /v2/clips/{job_id} for status,
    or configure a webhook_url to receive completion notification.
    """
    if not user.can_export():
        raise HTTPException(
            status_code=402,
            detail=f"Free plan limit reached ({user.FREE_EXPORT_LIMIT} exports/month). Upgrade to Pro."
        )

    # Create a job via the job manager
    from forge_engine.core.jobs import JobManager, JobType
    manager = JobManager.get_instance()

    job_id = str(uuid.uuid4())

    # Queue download + ingest + analyze + export job chain
    # For now, queue just the download phase; ingest/analyze/export chain off it
    await manager.enqueue(
        job_id=job_id,
        job_type=JobType.DOWNLOAD,
        project_id=None,
        kwargs={
            "url": request.url,
            "platform": request.platform,
            "max_clips": request.max_clips,
            "min_score": request.min_score,
            "language": request.language,
            "user_id": user.id,
            "api_v2": True,
        }
    )

    # Schedule webhook delivery on completion
    effective_webhook = request.webhook_url or user.webhook_url
    if effective_webhook:
        background_tasks.add_task(
            _await_and_deliver_webhook,
            job_id=job_id,
            webhook_url=effective_webhook,
            user_id=user.id,
        )

    return {
        "job_id": job_id,
        "status": "pending",
        "poll_url": f"/api/v2/clips/{job_id}",
        "message": "Processing started. Poll status or wait for webhook.",
    }


async def _await_and_deliver_webhook(job_id: str, webhook_url: str, user_id: str) -> None:
    """Poll job until done then deliver webhook."""
    import asyncio
    from forge_engine.core.database import async_session_maker
    from forge_engine.models.job import JobRecord

    for _ in range(360):  # max 30 min polling
        await asyncio.sleep(5)
        async with async_session_maker() as db:
            result = await db.execute(select(JobRecord).where(JobRecord.id == job_id))
            record = result.scalar_one_or_none()
            if record and record.status in ("completed", "failed"):
                payload = {
                    "job_id": job_id,
                    "status": record.status,
                    "result": record.result or {},
                    "user_id": user_id,
                    "event": "clip.completed",
                }
                await deliver_webhook(webhook_url, payload)
                return


@router.get("/{job_id}")
async def get_clip_status(
    job_id: str,
    user=Depends(get_api_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll clip processing status."""
    from forge_engine.models.job import JobRecord
    result = await db.execute(select(JobRecord).where(JobRecord.id == job_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "status": record.status,
        "progress": record.progress or 0.0,
        "result": record.result or {},
        "error": record.error,
    }


@router.post("/webhook/test")
async def test_webhook(
    webhook_url: str,
    user=Depends(get_api_user),
):
    """Send a test webhook payload to a URL."""
    payload = {
        "event": "test",
        "job_id": "test-" + str(uuid.uuid4())[:8],
        "status": "completed",
        "message": "This is a test webhook from FORGE LAB API v2",
    }
    await deliver_webhook(webhook_url, payload)
    return {"sent": True, "url": webhook_url}
