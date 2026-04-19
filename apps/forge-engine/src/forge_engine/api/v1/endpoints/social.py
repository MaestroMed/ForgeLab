"""Social Publishing API endpoints."""


from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from forge_engine.core.database import get_db
from forge_engine.services.social_publish import SocialPublishService

router = APIRouter()


class ConnectAccountRequest(BaseModel):
    """Request to connect a social account."""
    platform: str  # "tiktok", "youtube", "instagram"
    credentials: dict[str, str]


class PublishRequest(BaseModel):
    """Request to publish content."""
    platform: str
    video_path: str
    title: str
    description: str | None = None
    hashtags: list[str] | None = None
    schedule_time: str | None = None  # ISO format datetime
    visibility: str = "public"  # "public", "private", "unlisted"


class PublishStatusResponse(BaseModel):
    """Publish job status."""
    job_id: str
    platform: str
    status: str
    url: str | None = None
    error: str | None = None


@router.get("/status")
async def get_social_status():
    """Get social publishing status and connected accounts."""
    service = SocialPublishService.get_instance()

    return {
        "available": True,
        "connected_accounts": service.get_connected_platforms(),
        "supported_platforms": ["tiktok", "youtube", "instagram"]
    }


@router.get("/accounts")
async def list_accounts():
    """List connected social accounts."""
    service = SocialPublishService.get_instance()

    accounts = service.get_connected_platforms()

    return {
        "accounts": accounts,
        "count": len(accounts)
    }


@router.post("/accounts/connect")
async def connect_account(request: ConnectAccountRequest):
    """Connect a new social account."""
    service = SocialPublishService.get_instance()

    if request.platform not in ["tiktok", "youtube", "instagram"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported platform: {request.platform}"
        )

    success = await service.connect_account(
        platform=request.platform,
        credentials=request.credentials
    )

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Failed to connect account"
        )

    return {
        "success": True,
        "platform": request.platform,
        "message": "Account connected successfully"
    }


@router.delete("/accounts/{platform}")
async def disconnect_account(platform: str):
    """Disconnect a social account."""
    from forge_engine.services.social_publish import Platform
    try:
        p = Platform(platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    service = SocialPublishService.get_instance()
    await service.disconnect(p)
    return {"status": "disconnected", "platform": platform}


@router.post("/publish")
async def publish_content(request: PublishRequest):
    """Publish content to a social platform."""
    service = SocialPublishService.get_instance()

    if request.platform not in service.get_connected_platforms():
        raise HTTPException(
            status_code=400,
            detail=f"No account connected for {request.platform}"
        )

    job_id = await service.publish(
        platform=request.platform,
        video_path=request.video_path,
        title=request.title,
        description=request.description,
        hashtags=request.hashtags,
        schedule_time=request.schedule_time,
        visibility=request.visibility
    )

    return {
        "job_id": job_id,
        "status": "started",
        "platform": request.platform
    }


@router.get("/publish/{job_id}")
async def get_publish_status(job_id: str):
    """Get status of a publish job."""
    service = SocialPublishService.get_instance()

    status = await service.get_publish_status(job_id)

    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return PublishStatusResponse(**status)


class PublishArtifactRequest(BaseModel):
    """Publish an artifact to social media."""
    artifact_id: str
    project_id: str
    platform: str
    title: str
    description: str = ""
    hashtags: list[str] = []
    schedule_time: str | None = None  # ISO datetime
    visibility: str = "public"


@router.post("/publish/artifact")
async def publish_artifact(
    request: PublishArtifactRequest,
    db: AsyncSession = Depends(get_db),
):
    """Publish an artifact (exported clip) to a social media platform."""
    from forge_engine.models.artifact import Artifact
    from forge_engine.services.social_publish import Platform, PublishRequest

    artifact = await db.get(Artifact, request.artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    try:
        platform = Platform(request.platform)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {request.platform}")

    service = SocialPublishService.get_instance()
    if not service.is_authenticated(platform):
        raise HTTPException(status_code=401, detail=f"Not connected to {request.platform}")

    schedule = None
    if request.schedule_time:
        try:
            schedule = datetime.fromisoformat(request.schedule_time)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid schedule_time format")

    pub_request = PublishRequest(
        video_path=artifact.path,
        title=request.title,
        description=request.description,
        hashtags=request.hashtags,
        platform=platform,
        schedule_time=schedule,
        privacy=request.visibility,
    )

    result = await service.publish(pub_request)
    return {
        "success": result.success,
        "platform": result.platform.value,
        "status": result.status.value,
        "video_url": result.video_url,
        "video_id": result.video_id,
        "error": result.error,
        "published_at": result.published_at.isoformat() if result.published_at else None,
    }


@router.get("/platforms/{platform}/requirements")
async def get_platform_requirements(platform: str):
    """Get requirements for a specific platform."""
    requirements = {
        "tiktok": {
            "max_duration": 180,  # 3 minutes
            "aspect_ratios": ["9:16"],
            "max_file_size_mb": 287,
            "formats": ["mp4", "webm"],
            "max_title_length": 150,
            "max_hashtags": 10
        },
        "youtube": {
            "max_duration": 43200,  # 12 hours
            "aspect_ratios": ["16:9", "9:16", "1:1"],
            "max_file_size_mb": 256000,
            "formats": ["mp4", "mov", "avi"],
            "max_title_length": 100,
            "max_description_length": 5000
        },
        "instagram": {
            "max_duration": 90,
            "aspect_ratios": ["9:16", "1:1", "4:5"],
            "max_file_size_mb": 650,
            "formats": ["mp4"],
            "max_caption_length": 2200,
            "max_hashtags": 30
        }
    }

    if platform not in requirements:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown platform: {platform}"
        )

    return requirements[platform]
