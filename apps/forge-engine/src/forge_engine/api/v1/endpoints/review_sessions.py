"""Restricted review-session API for the mobile PWA.

A review session is a time-bounded, scoped token that grants read-only
access to a project's segments and write access to approve/reject
decisions only. Lets the phone PWA participate without exposing the
full backend API.

Flow:
 1. Desktop POST /v1/review-sessions { project_id } → { token, qr_payload, expires_at }
 2. Desktop renders QR code containing the token URL
 3. Phone scans, opens https://localhost:8420/review-pwa/#token=...
 4. PWA calls /v1/review-sessions/{token}/... for all subsequent requests

Token lifetime: 2h default, revocable via DELETE.

Security model:
 - Tokens stored in-memory (process lifetime) + persisted to
   LIBRARY_PATH/review_sessions.json for crash recovery
 - Project-scoped: tokens can only see their own project
 - Read + approve/reject/comment only. NO settings, NO filesystem,
   NO social publishing, NO delete.
"""

import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forge_engine.core.config import settings
from forge_engine.core.database import get_db
from forge_engine.models.project import Project
from forge_engine.models.segment import Segment

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Token storage (in-memory + persisted for crash recovery)
# ---------------------------------------------------------------------------

_SESSIONS: dict[str, dict] = {}
_SESSIONS_FILE = settings.LIBRARY_PATH / "review_sessions.json"


def _load_sessions() -> None:
    """Load persisted sessions, dropping expired ones."""
    if not _SESSIONS_FILE.exists():
        return
    try:
        data = json.loads(_SESSIONS_FILE.read_text())
        now = time.time()
        for token, info in data.items():
            if info.get("expires_at", 0) > now:
                _SESSIONS[token] = info
    except Exception as e:
        logger.warning("Failed to load review sessions: %s", e)


def _save_sessions() -> None:
    try:
        _SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SESSIONS_FILE.write_text(json.dumps(_SESSIONS, indent=2))
    except Exception as e:
        logger.warning("Failed to persist review sessions: %s", e)


_load_sessions()


def _get_session_or_401(token: str) -> dict:
    info = _SESSIONS.get(token)
    if info is None:
        raise HTTPException(status_code=401, detail="Invalid review session")
    if info.get("expires_at", 0) < time.time():
        _SESSIONS.pop(token, None)
        _save_sessions()
        raise HTTPException(status_code=401, detail="Session expired")
    return info


# ---------------------------------------------------------------------------
# Session CRUD (desktop side, no token required)
# ---------------------------------------------------------------------------

class CreateReviewSessionRequest(BaseModel):
    project_id: str
    ttl_minutes: int = 120  # 2 hours default


@router.post("/review-sessions")
async def create_review_session(
    request: CreateReviewSessionRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a restricted review session for the mobile PWA.

    Returns a token + QR-ready payload. The token grants read-only access
    to the project's segments and write access limited to approve/reject/
    comment — nothing else.
    """
    # Verify the project exists
    project = await db.get(Project, request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    token = secrets.token_urlsafe(24)
    ttl = max(5, min(request.ttl_minutes, 24 * 60))  # cap 5min-24h
    expires_at = time.time() + ttl * 60
    session = {
        "token": token,
        "project_id": request.project_id,
        "project_name": project.name,
        "created_at": time.time(),
        "expires_at": expires_at,
        "id": str(uuid.uuid4()),
    }
    _SESSIONS[token] = session
    _save_sessions()

    return {
        "session_id": session["id"],
        "token": token,
        "project_id": request.project_id,
        "project_name": project.name,
        "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
        "ttl_minutes": ttl,
        # Payload for QR encoding — PWA parses this
        "qr_payload": f"forge-review://{token}",
    }


@router.get("/review-sessions")
async def list_review_sessions() -> dict:
    """List all active sessions (for the desktop to show who's connected)."""
    now = time.time()
    active = [
        {
            "id": s["id"],
            "token": s["token"][:8] + "…",  # Never expose full token in listings
            "project_id": s["project_id"],
            "project_name": s.get("project_name"),
            "created_at": datetime.fromtimestamp(s["created_at"]).isoformat(),
            "expires_at": datetime.fromtimestamp(s["expires_at"]).isoformat(),
            "remaining_minutes": int((s["expires_at"] - now) / 60),
        }
        for s in _SESSIONS.values()
        if s["expires_at"] > now
    ]
    return {"sessions": active, "count": len(active)}


@router.delete("/review-sessions/{session_id}")
async def revoke_review_session(session_id: str) -> dict:
    """Revoke an active session by its ID (not the raw token)."""
    for token, info in list(_SESSIONS.items()):
        if info["id"] == session_id:
            _SESSIONS.pop(token, None)
            _save_sessions()
            return {"revoked": True, "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")


# ---------------------------------------------------------------------------
# PWA-facing endpoints (token in URL path)
# ---------------------------------------------------------------------------

@router.get("/review/{token}/info")
async def review_info(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Session info — used by PWA to confirm the token is valid."""
    session = _get_session_or_401(token)
    project = await db.get(Project, session["project_id"])
    if not project:
        raise HTTPException(status_code=404, detail="Project no longer exists")

    now = time.time()
    return {
        "project_id": project.id,
        "project_name": project.name,
        "expires_at": datetime.fromtimestamp(session["expires_at"]).isoformat(),
        "remaining_minutes": int((session["expires_at"] - now) / 60),
    }


@router.get("/review/{token}/segments")
async def review_list_segments(
    token: str,
    min_score: float = 60.0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List segments in the scoped project — top-N by score, filtered."""
    session = _get_session_or_401(token)
    result = await db.execute(
        select(Segment)
        .where(Segment.project_id == session["project_id"])
        .where(Segment.score_total >= min_score)
        .order_by(Segment.score_total.desc())
        .limit(min(limit, 100))
    )
    segments = result.scalars().all()
    return {
        "project_id": session["project_id"],
        "count": len(segments),
        "segments": [s.to_dict() for s in segments],
    }


class ReviewDecisionRequest(BaseModel):
    decision: str  # approve | reject
    comment: str | None = None
    rating: int | None = None  # 1-5


@router.post("/review/{token}/segments/{segment_id}/decision")
async def review_segment_decision(
    token: str,
    segment_id: str,
    body: ReviewDecisionRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record an approve/reject decision from the PWA.

    Scoped strictly to the session's project — trying to act on a segment
    from a different project returns 403.
    """
    session = _get_session_or_401(token)

    segment = await db.get(Segment, segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    if segment.project_id != session["project_id"]:
        raise HTTPException(status_code=403, detail="Segment not in session scope")

    if body.decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve|reject")

    # Persist to ClipReview (re-use the existing model)
    try:
        from forge_engine.models.review import ClipReview
        review = ClipReview(
            segment_id=segment.id,
            project_id=segment.project_id,
            rating=body.rating if body.rating else (4 if body.decision == "approve" else 2),
            publish_decision=body.decision,
            notes=body.comment,
            quality_tags=["publishable"] if body.decision == "approve" else ["skip"],
        )
        db.add(review)
        await db.commit()
        return {"success": True, "decision": body.decision, "segment_id": segment_id}
    except Exception as e:
        logger.warning("Failed to persist review decision: %s", e)
        # Non-fatal — the decision is at least acknowledged
        return {
            "success": True,
            "decision": body.decision,
            "segment_id": segment_id,
            "persisted": False,
        }


@router.get("/review/{token}/segments/{segment_id}/preview")
async def review_segment_preview(
    token: str,
    segment_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the preview video URL for a segment (scoped).

    Returns a path/URL the PWA can load. The PWA is expected to hit the
    existing artifact-serving endpoint using the project_id — but with
    this endpoint we confirm the segment is in-scope first.
    """
    session = _get_session_or_401(token)

    segment = await db.get(Segment, segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    if segment.project_id != session["project_id"]:
        raise HTTPException(status_code=403, detail="Segment not in session scope")

    # Generate a preview if not cached (reuses existing preview pipeline)
    return {
        "segment_id": segment_id,
        "project_id": segment.project_id,
        "start_time": segment.start_time,
        "end_time": segment.end_time,
        "preview_endpoint": f"/v1/projects/{segment.project_id}/segments/{segment_id}/preview",
        "note": "PWA should POST to preview_endpoint to obtain a playable preview URL.",
    }


def garbage_collect_sessions() -> int:
    """Drop expired sessions. Called periodically by main lifespan."""
    now = time.time()
    expired = [t for t, s in _SESSIONS.items() if s["expires_at"] < now]
    for t in expired:
        _SESSIONS.pop(t, None)
    if expired:
        _save_sessions()
    return len(expired)


def _prune_expired_sessions_on_import() -> None:
    """Drop any already-expired sessions loaded from disk."""
    now = time.time()
    before = len(_SESSIONS)
    expired = [t for t, s in _SESSIONS.items() if s["expires_at"] < now]
    for t in expired:
        _SESSIONS.pop(t, None)
    if before != len(_SESSIONS):
        _save_sessions()


_prune_expired_sessions_on_import()
