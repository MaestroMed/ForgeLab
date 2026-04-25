"""Main API router for v1."""

from fastapi import APIRouter

from forge_engine.api.v1.endpoints import (
    analytics,
    assistant,
    audio,
    capabilities,
    channels,
    compilation,
    content,
    dictionaries,
    emotion,
    jobs,
    llm,
    ml_scoring,
    monitor,
    profiles,
    projects,
    reviews,
    social,
    templates,
    thumbnails,
    translation,
    virality,
    websockets,
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(templates.router, prefix="/templates", tags=["Templates"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["Profiles"])
api_router.include_router(channels.router, prefix="/channels", tags=["Channels"])
api_router.include_router(dictionaries.router, tags=["Dictionaries"])
api_router.include_router(capabilities.router, tags=["System"])
api_router.include_router(thumbnails.router, tags=["Thumbnails"])
api_router.include_router(websockets.router, tags=["Real-time"])
api_router.include_router(monitor.router, prefix="/monitor", tags=["Monitor"])
api_router.include_router(llm.router, prefix="/llm", tags=["AI/LLM"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["AI Assistant"])

# New AI/ML endpoints
api_router.include_router(emotion.router, prefix="/emotion", tags=["Emotion Detection"])
api_router.include_router(audio.router, prefix="/audio", tags=["Audio Analysis"])
api_router.include_router(ml_scoring.router, prefix="/ml-scoring", tags=["ML Scoring"])
api_router.include_router(content.router, prefix="/content", tags=["Content Generation"])
api_router.include_router(translation.router, prefix="/translation", tags=["Translation"])
api_router.include_router(virality.router, prefix="/virality", tags=["Virality Prediction"])
api_router.include_router(compilation.router, prefix="/compilation", tags=["Compilation"])
api_router.include_router(social.router, prefix="/social", tags=["Social Publishing"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(reviews.router, prefix="/clips", tags=["Clip Review & Queue"])

from forge_engine.api.v1.endpoints.auth import router as auth_router
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

from forge_engine.api.v1.endpoints.upload import router as upload_router
api_router.include_router(upload_router, prefix="/upload", tags=["upload"])

from forge_engine.api.v1.endpoints.cloud import router as cloud_router
from forge_engine.api.v1.endpoints.whitelabel import router as whitelabel_router
api_router.include_router(cloud_router, prefix="/cloud", tags=["cloud"])
api_router.include_router(whitelabel_router, prefix="/enterprise", tags=["enterprise"])

from forge_engine.api.v1.endpoints.pipeline import router as pipeline_router
api_router.include_router(pipeline_router, prefix="/pipeline", tags=["pipeline"])

# FORGE LAB 2.0 — restricted review sessions for mobile PWA
from forge_engine.api.v1.endpoints.review_sessions import router as review_sessions_router
api_router.include_router(review_sessions_router, tags=["Review Sessions"])





