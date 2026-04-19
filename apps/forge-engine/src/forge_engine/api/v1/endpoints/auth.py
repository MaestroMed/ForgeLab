"""Auth endpoints: register, login, refresh, me."""

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forge_engine.core.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from forge_engine.core.database import get_db
from forge_engine.models.user import User

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


# ── Dependency ──────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Extract and validate JWT, return User or None (soft auth)."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None
    return user


async def require_user(
    user: User | None = Depends(get_current_user),
) -> User:
    """Require a valid authenticated user (raises 401)."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


# ── Schemas ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    username: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdatePlanRequest(BaseModel):
    plan: str  # free | pro | enterprise


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    existing = await db.execute(select(User).where(User.email == request.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=request.email,
        username=request.username,
        hashed_password=hash_password(request.password),
        plan="free",
        api_key=secrets.token_urlsafe(32),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "user": user.to_dict(),
        "access_token": create_access_token(user.id, user.plan),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


@router.post("/login")
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login and receive JWT tokens."""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return {
        "user": user.to_dict(),
        "access_token": create_access_token(user.id, user.plan),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


@router.post("/refresh")
async def refresh_token(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using a refresh token."""
    payload = decode_token(request.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "access_token": create_access_token(user.id, user.plan),
        "token_type": "bearer",
    }


@router.get("/me")
async def get_me(user: User = Depends(require_user)):
    """Get current user profile."""
    return user.to_dict()


@router.post("/me/api-key/rotate")
async def rotate_api_key(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """Rotate the user's API key."""
    user.api_key = secrets.token_urlsafe(32)
    await db.commit()
    return {"api_key": user.api_key}


@router.patch("/me/plan")
async def update_plan(
    request: UpdatePlanRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user plan (admin/payment webhook would call this)."""
    if request.plan not in ("free", "pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    user.plan = request.plan
    await db.commit()
    return user.to_dict()


@router.get("/me/quota")
async def get_quota(user: User = Depends(require_user)):
    """Get current export quota status."""
    limit = None if user.plan != "free" else User.FREE_EXPORT_LIMIT
    return {
        "plan": user.plan,
        "exports_this_month": user.exports_this_month,
        "limit": limit,
        "can_export": user.can_export(),
        "resets_at": user.exports_reset_at.isoformat() if user.exports_reset_at else None,
    }


class UpdateWebhookRequest(BaseModel):
    webhook_url: str | None = None


@router.patch("/me/webhook")
async def update_webhook(
    request: UpdateWebhookRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Set or clear the default webhook URL for API v2 completions."""
    user.webhook_url = request.webhook_url
    await db.commit()
    return {"webhook_url": user.webhook_url}
