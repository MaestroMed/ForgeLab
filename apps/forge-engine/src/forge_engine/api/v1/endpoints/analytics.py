"""Analytics API endpoints."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from forge_engine.services.analytics import AnalyticsService

router = APIRouter()


class RecordEventRequest(BaseModel):
    """Request to record an analytics event."""
    event_type: str
    project_id: str | None = None
    segment_id: str | None = None
    clip_id: str | None = None
    platform: str | None = None
    metadata: dict[str, Any] | None = None


class ClipPerformanceRequest(BaseModel):
    """Request to update clip performance metrics."""
    clip_id: str
    platform: str
    views: int | None = None
    likes: int | None = None
    comments: int | None = None
    shares: int | None = None
    watch_time_avg: float | None = None


@router.get("/dashboard")
async def get_dashboard(
    project_id: str | None = None,
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
    """Get quick analytics overview (aggregated from cached metrics)."""
    service = AnalyticsService.get_instance()
    try:
        metrics = service.get_cached_metrics()
        summary = await service.get_summary(metrics)
        return {
            "total_projects": 0,  # Filled by frontend from separate call
            "total_clips": summary.total_videos,
            "total_views": summary.total_views,
            "total_likes": summary.total_likes,
            "avg_engagement": round(summary.avg_engagement_rate, 2),
            "avg_completion": round(summary.avg_completion_rate, 2),
            "avg_score": 0,
            "top_score": summary.best_performing.viral_score if summary.best_performing else 0,
            "platform_breakdown": summary.platform_breakdown,
        }
    except Exception:
        # Graceful empty state when no data yet
        return {
            "total_projects": 0,
            "total_clips": 0,
            "total_views": 0,
            "total_likes": 0,
            "avg_engagement": 0,
            "avg_completion": 0,
            "avg_score": 0,
            "top_score": 0,
            "platform_breakdown": {},
        }


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
    project_id: str | None = None,
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


@router.get("/summary")
async def get_analytics_summary(platform: str = "tiktok", limit: int = 5):
    """Get analytics summary: top clips, averages, and performance trends."""
    from forge_engine.services.virality_predictor import ViralityPredictor
    predictor = ViralityPredictor.get_instance()

    records = [
        r for r in predictor._performance_data
        if r.get("platform") == platform and r.get("views", 0) > 0
    ]

    if not records:
        return {
            "platform": platform,
            "total_clips": 0,
            "total_views": 0,
            "avg_views": 0,
            "avg_completion_rate": 0,
            "avg_engagement": 0,
            "top_clips": [],
            "accuracy": None,
        }

    # Sort by views descending
    records_sorted = sorted(records, key=lambda r: r.get("views", 0), reverse=True)
    top = records_sorted[:limit]

    total_views = sum(r.get("views", 0) for r in records)
    avg_views = total_views // len(records)
    avg_completion = sum(r.get("completion_rate", 0) for r in records) / len(records)

    # Prediction accuracy: mean absolute error between predicted and actual score
    accuracy = None
    scored = [r for r in records if "actual_score" in r and "predicted_score" in r]
    if scored:
        mae = sum(abs(r["actual_score"] - r["predicted_score"]) for r in scored) / len(scored)
        accuracy = round(100 - min(100, mae), 1)  # Accuracy as percentage

    return {
        "platform": platform,
        "total_clips": len(records),
        "total_views": total_views,
        "avg_views": avg_views,
        "avg_completion_rate": round(avg_completion, 3),
        "top_clips": [
            {
                "segment_id": r.get("segment_id"),
                "views": r.get("views", 0),
                "likes": r.get("likes", 0),
                "predicted_score": round(r.get("predicted_score", 0), 1),
                "actual_score": round(r.get("actual_score", 0), 1),
                "timestamp": r.get("timestamp"),
            }
            for r in top
        ],
        "prediction_accuracy_pct": accuracy,
    }


@router.get("/trends/performance")
async def get_performance_trends(platform: str = "tiktok", weeks: int = 8):
    """Get weekly performance trends for charting."""
    import time
    from forge_engine.services.virality_predictor import ViralityPredictor
    predictor = ViralityPredictor.get_instance()

    now = time.time()
    week_seconds = 7 * 24 * 3600

    buckets: dict[int, dict] = {}
    for w in range(weeks):
        buckets[w] = {"week": w, "views": 0, "clips": 0, "avg_score": 0.0}

    for r in predictor._performance_data:
        if r.get("platform") != platform:
            continue
        age = now - r.get("timestamp", now)
        week_idx = int(age // week_seconds)
        if week_idx < weeks:
            buckets[week_idx]["views"] += r.get("views", 0)
            buckets[week_idx]["clips"] += 1

    # Reverse so week 0 = oldest
    trend_list = list(reversed([buckets[w] for w in range(weeks)]))
    return {"platform": platform, "weeks": weeks, "data": trend_list}


@router.get("/export")
async def export_analytics(
    project_id: str | None = None,
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
