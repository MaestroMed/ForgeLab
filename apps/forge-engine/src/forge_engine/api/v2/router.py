"""API v2 router — public clip processing API."""

from fastapi import APIRouter

from forge_engine.api.v2.endpoints.clips import router as clips_router

v2_router = APIRouter(prefix="/api/v2")
v2_router.include_router(clips_router, prefix="/clips", tags=["clips-v2"])
