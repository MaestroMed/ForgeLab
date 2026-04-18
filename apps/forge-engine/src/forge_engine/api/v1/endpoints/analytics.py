"""Analytics API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from forge_engine.services.analytics import AnalyticsService

router = APIRouter()


class RecordEventRequest(BaseModel):
    """Request to record an analytics event."""
    event_type: str
    project_id: Optional[str] = None
    segment_id: Optional[str] = None
    clip_id: Optional[str] = None
    platform: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ClipPerformanceRequest(BaseModel):
    """Request to update clip performance metrics."""
    clip_id: str
    platform: str
    views: Optional[int] = None
    likes: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None
    watch_time_avg: Optional[float] = None


@router.get("/dashboard")
async def get_dashboard(
    project_id: Optional[str] = None,
    days: int = 30
):
    """Get analytics dashboard data."""
    service = AnalyticsService.get_instance()
    
    dashboard = await service.get_dashboard(
        project_id=project_id,
        days=days
    )
    
    return dashboard


@router.get("/overview")
async def get_overview():
    """Get quick analytics overview."""
    service = AnalyticsService.get_instance()
    
    return await service.get_overview()


@router.get("/clips/{clip_id}/stats")
async def get_clip_stats(clip_id: str):
    """Get performance stats for a specific clip."""
    service = AnalyticsService.get_instance()
    
    stats = await service.get_clip_stats(clip_id)
    
    if stats is None:
        return {
            "clip_id": clip_id,
            "platforms": {},
            "total_views": 0,
            "total_engagement": 0,
            "message": "No performance data available"
        }
    
    return stats


@router.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: str,
    days: int = 30
):
    """Get analytics for a specific project."""
    service = AnalyticsService.get_instance()
    
    stats = await service.get_project_stats(
        project_id=project_id,
        days=days
    )
    
    return stats


@router.post("/events")
async def record_event(request: RecordEventRequest):
    """Record an analytics event."""
    service = AnalyticsService.get_instance()
    
    await service.record_event(
        event_type=request.event_type,
        project_id=request.project_id,
        segment_id=request.segment_id,
        clip_id=request.clip_id,
        platform=request.platform,
        metadata=request.metadata
    )
    
    return {"success": True, "event_type": request.event_type}


@router.post("/clips/performance")
async def update_clip_performance(request: ClipPerformanceRequest):
    """Update performance metrics for a clip."""
    service = AnalyticsService.get_instance()
    
    await service.update_clip_performance(
        clip_id=request.clip_id,
        platform=request.platform,
        views=request.views,
        likes=request.likes,
        comments=request.comments,
        shares=request.shares,
        watch_time_avg=request.watch_time_avg
    )
    
    return {
        "success": True,
        "clip_id": request.clip_id,
        "platform": request.platform
    }


@router.get("/top-clips")
async def get_top_clips(
    limit: int = 10,
    metric: str = "views",  # "views", "engagement", "score"
    days: int = 30
):
    """Get top performing clips."""
    service = AnalyticsService.get_instance()
    
    clips = await service.get_top_clips(
        limit=limit,
        metric=metric,
        days=days
    )
    
    return {
        "clips": clips,
        "metric": metric,
        "period_days": days
    }


@router.get("/trends")
async def get_trends(
    project_id: Optional[str] = None,
    days: int = 30,
    granularity: str = "day"  # "hour", "day", "week"
):
    """Get analytics trends over time."""
    service = AnalyticsService.get_instance()
    
    trends = await service.get_trends(
        project_id=project_id,
        days=days,
        granularity=granularity
    )
    
    return trends


@router.get("/export")
async def export_analytics(
    project_id: Optional[str] = None,
    format: str = "json",  # "json", "csv"
    days: int = 90
):
    """Export analytics data."""
    service = AnalyticsService.get_instance()
    
    data = await service.export_data(
        project_id=project_id,
        format=format,
        days=days
    )
    
    return data
