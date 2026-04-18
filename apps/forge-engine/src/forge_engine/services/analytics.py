"""Analytics Service for tracking clip performance."""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from forge_engine.core.config import settings
from forge_engine.services.social_publish import Platform

logger = logging.getLogger(__name__)


@dataclass
class VideoMetrics:
    """Performance metrics for a video."""
    video_id: str
    platform: Platform
    title: str
    
    # Views & Engagement
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0  # TikTok/Instagram
    
    # Watch metrics
    watch_time_hours: float = 0.0
    avg_view_duration: float = 0.0
    completion_rate: float = 0.0
    
    # Audience
    impressions: int = 0
    reach: int = 0
    
    # Growth
    subscribers_gained: int = 0
    followers_gained: int = 0
    
    # Calculated
    engagement_rate: float = 0.0
    viral_score: float = 0.0
    
    # Timestamps
    published_at: Optional[datetime] = None
    fetched_at: Optional[datetime] = None
    
    def calculate_engagement_rate(self):
        """Calculate engagement rate."""
        if self.views > 0:
            total_engagement = self.likes + self.comments + self.shares + self.saves
            self.engagement_rate = (total_engagement / self.views) * 100
        else:
            self.engagement_rate = 0
    
    def calculate_viral_score(self):
        """Calculate a viral score based on performance."""
        # Weighted formula
        score = 0
        
        # Views (logarithmic scale)
        import math
        if self.views > 0:
            score += min(30, math.log10(self.views) * 10)
        
        # Engagement rate (max 30 points)
        score += min(30, self.engagement_rate * 3)
        
        # Completion rate (max 20 points)
        score += self.completion_rate * 20
        
        # Shares are highly viral (max 20 points)
        if self.views > 0:
            share_rate = (self.shares / self.views) * 100
            score += min(20, share_rate * 20)
        
        self.viral_score = min(100, score)


@dataclass
class AnalyticsSummary:
    """Summary analytics across all videos."""
    total_videos: int = 0
    total_views: int = 0
    total_likes: int = 0
    total_comments: int = 0
    total_shares: int = 0
    total_watch_hours: float = 0.0
    
    avg_views_per_video: float = 0.0
    avg_engagement_rate: float = 0.0
    avg_completion_rate: float = 0.0
    
    best_performing: Optional[VideoMetrics] = None
    worst_performing: Optional[VideoMetrics] = None
    
    growth_trend: str = "stable"  # growing, stable, declining
    platform_breakdown: Dict[str, Dict[str, int]] = field(default_factory=dict)


class AnalyticsService:
    """
    Service for fetching and analyzing video performance.
    
    Integrates with platform APIs to get real metrics.
    """
    
    YOUTUBE_ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2"
    
    _instance: Optional["AnalyticsService"] = None
    
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        self._cache: Dict[str, VideoMetrics] = {}
        self._cache_path = settings.LIBRARY_PATH / "analytics_cache.json"
        
        self._load_cache()
    
    @classmethod
    def get_instance(cls) -> "AnalyticsService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def _load_cache(self):
        """Load cached analytics."""
        if self._cache_path.exists():
            try:
                with open(self._cache_path, 'r') as f:
                    data = json.load(f)
                    for key, metrics in data.items():
                        self._cache[key] = VideoMetrics(
                            video_id=metrics["video_id"],
                            platform=Platform(metrics["platform"]),
                            title=metrics.get("title", ""),
                            views=metrics.get("views", 0),
                            likes=metrics.get("likes", 0),
                            comments=metrics.get("comments", 0),
                            shares=metrics.get("shares", 0),
                            saves=metrics.get("saves", 0),
                            engagement_rate=metrics.get("engagement_rate", 0),
                            viral_score=metrics.get("viral_score", 0),
                        )
                logger.info(f"Loaded {len(self._cache)} cached analytics entries")
            except Exception as e:
                logger.warning(f"Failed to load analytics cache: {e}")
    
    def _save_cache(self):
        """Save analytics to cache."""
        try:
            data = {}
            for key, metrics in self._cache.items():
                data[key] = {
                    "video_id": metrics.video_id,
                    "platform": metrics.platform.value,
                    "title": metrics.title,
                    "views": metrics.views,
                    "likes": metrics.likes,
                    "comments": metrics.comments,
                    "shares": metrics.shares,
                    "saves": metrics.saves,
                    "engagement_rate": metrics.engagement_rate,
                    "viral_score": metrics.viral_score,
                }
            
            with open(self._cache_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save analytics cache: {e}")
    
    async def fetch_video_metrics(
        self,
        platform: Platform,
        video_id: str,
        access_token: str
    ) -> Optional[VideoMetrics]:
        """
        Fetch metrics for a specific video.
        
        Args:
            platform: Platform the video is on
            video_id: Video ID
            access_token: OAuth access token
        
        Returns:
            VideoMetrics or None if failed
        """
        try:
            if platform == Platform.YOUTUBE:
                return await self._fetch_youtube_metrics(video_id, access_token)
            
            elif platform == Platform.TIKTOK:
                return await self._fetch_tiktok_metrics(video_id, access_token)
            
            elif platform == Platform.INSTAGRAM:
                return await self._fetch_instagram_metrics(video_id, access_token)
        
        except Exception as e:
            logger.error(f"Failed to fetch metrics for {video_id}: {e}")
        
        return None
    
    async def _fetch_youtube_metrics(
        self,
        video_id: str,
        access_token: str
    ) -> Optional[VideoMetrics]:
        """Fetch YouTube video metrics."""
        # Get video statistics
        stats_response = await self._client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "statistics,snippet",
                "id": video_id
            },
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if stats_response.status_code != 200:
            return None
        
        data = stats_response.json()
        if not data.get("items"):
            return None
        
        item = data["items"][0]
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        
        metrics = VideoMetrics(
            video_id=video_id,
            platform=Platform.YOUTUBE,
            title=snippet.get("title", ""),
            views=int(stats.get("viewCount", 0)),
            likes=int(stats.get("likeCount", 0)),
            comments=int(stats.get("commentCount", 0)),
            fetched_at=datetime.now()
        )
        
        # Try to get analytics (watch time, etc.)
        try:
            analytics_response = await self._client.get(
                f"{self.YOUTUBE_ANALYTICS_API}/reports",
                params={
                    "ids": "channel==MINE",
                    "startDate": "2020-01-01",
                    "endDate": datetime.now().strftime("%Y-%m-%d"),
                    "metrics": "estimatedMinutesWatched,averageViewDuration,views,subscribersGained",
                    "filters": f"video=={video_id}"
                },
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if analytics_response.status_code == 200:
                analytics_data = analytics_response.json()
                rows = analytics_data.get("rows", [])
                if rows:
                    row = rows[0]
                    metrics.watch_time_hours = row[0] / 60 if len(row) > 0 else 0
                    metrics.avg_view_duration = row[1] if len(row) > 1 else 0
                    metrics.subscribers_gained = row[3] if len(row) > 3 else 0
        except Exception as e:
            logger.debug(f"Failed to fetch YouTube analytics: {e}")
        
        metrics.calculate_engagement_rate()
        metrics.calculate_viral_score()
        
        # Cache result
        cache_key = f"{platform.value}:{video_id}"
        self._cache[cache_key] = metrics
        self._save_cache()
        
        return metrics
    
    async def _fetch_tiktok_metrics(
        self,
        video_id: str,
        access_token: str
    ) -> Optional[VideoMetrics]:
        """Fetch TikTok video metrics."""
        # TikTok API for video stats
        response = await self._client.post(
            "https://open.tiktokapis.com/v2/video/query/",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "filters": {"video_ids": [video_id]},
                "fields": ["id", "title", "view_count", "like_count", "comment_count", "share_count"]
            }
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        videos = data.get("data", {}).get("videos", [])
        
        if not videos:
            return None
        
        video = videos[0]
        
        metrics = VideoMetrics(
            video_id=video_id,
            platform=Platform.TIKTOK,
            title=video.get("title", ""),
            views=video.get("view_count", 0),
            likes=video.get("like_count", 0),
            comments=video.get("comment_count", 0),
            shares=video.get("share_count", 0),
            fetched_at=datetime.now()
        )
        
        metrics.calculate_engagement_rate()
        metrics.calculate_viral_score()
        
        cache_key = f"{Platform.TIKTOK.value}:{video_id}"
        self._cache[cache_key] = metrics
        self._save_cache()
        
        return metrics
    
    async def _fetch_instagram_metrics(
        self,
        video_id: str,
        access_token: str
    ) -> Optional[VideoMetrics]:
        """Fetch Instagram Reels metrics."""
        response = await self._client.get(
            f"https://graph.instagram.com/{video_id}",
            params={
                "fields": "id,caption,like_count,comments_count,media_type,timestamp",
                "access_token": access_token
            }
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        
        metrics = VideoMetrics(
            video_id=video_id,
            platform=Platform.INSTAGRAM,
            title=data.get("caption", "")[:100],
            likes=data.get("like_count", 0),
            comments=data.get("comments_count", 0),
            fetched_at=datetime.now()
        )
        
        # Instagram insights require additional API call
        try:
            insights_response = await self._client.get(
                f"https://graph.instagram.com/{video_id}/insights",
                params={
                    "metric": "impressions,reach,saved,shares,video_views",
                    "access_token": access_token
                }
            )
            
            if insights_response.status_code == 200:
                insights_data = insights_response.json()
                for insight in insights_data.get("data", []):
                    name = insight.get("name")
                    value = insight.get("values", [{}])[0].get("value", 0)
                    
                    if name == "impressions":
                        metrics.impressions = value
                    elif name == "reach":
                        metrics.reach = value
                    elif name == "saved":
                        metrics.saves = value
                    elif name == "shares":
                        metrics.shares = value
                    elif name == "video_views":
                        metrics.views = value
        except Exception as e:
            logger.debug(f"Failed to fetch Instagram insights: {e}")
        
        metrics.calculate_engagement_rate()
        metrics.calculate_viral_score()
        
        cache_key = f"{Platform.INSTAGRAM.value}:{video_id}"
        self._cache[cache_key] = metrics
        self._save_cache()
        
        return metrics
    
    async def get_summary(
        self,
        video_metrics: List[VideoMetrics]
    ) -> AnalyticsSummary:
        """
        Generate summary analytics from video metrics.
        
        Args:
            video_metrics: List of video metrics
        
        Returns:
            AnalyticsSummary
        """
        summary = AnalyticsSummary()
        
        if not video_metrics:
            return summary
        
        summary.total_videos = len(video_metrics)
        
        for metrics in video_metrics:
            summary.total_views += metrics.views
            summary.total_likes += metrics.likes
            summary.total_comments += metrics.comments
            summary.total_shares += metrics.shares
            summary.total_watch_hours += metrics.watch_time_hours
            
            # Platform breakdown
            platform = metrics.platform.value
            if platform not in summary.platform_breakdown:
                summary.platform_breakdown[platform] = {
                    "videos": 0, "views": 0, "likes": 0
                }
            summary.platform_breakdown[platform]["videos"] += 1
            summary.platform_breakdown[platform]["views"] += metrics.views
            summary.platform_breakdown[platform]["likes"] += metrics.likes
        
        # Averages
        summary.avg_views_per_video = summary.total_views / summary.total_videos
        summary.avg_engagement_rate = sum(m.engagement_rate for m in video_metrics) / summary.total_videos
        
        completion_rates = [m.completion_rate for m in video_metrics if m.completion_rate > 0]
        if completion_rates:
            summary.avg_completion_rate = sum(completion_rates) / len(completion_rates)
        
        # Best/worst
        sorted_by_views = sorted(video_metrics, key=lambda m: m.views, reverse=True)
        summary.best_performing = sorted_by_views[0] if sorted_by_views else None
        summary.worst_performing = sorted_by_views[-1] if sorted_by_views else None
        
        return summary
    
    def get_cached_metrics(self, platform: Optional[Platform] = None) -> List[VideoMetrics]:
        """Get all cached metrics, optionally filtered by platform."""
        metrics = list(self._cache.values())
        
        if platform:
            metrics = [m for m in metrics if m.platform == platform]
        
        return metrics
    
    async def close(self):
        """Close HTTP client."""
        await self._client.aclose()


# Convenience functions
def get_analytics_service() -> AnalyticsService:
    """Get the analytics service instance."""
    return AnalyticsService.get_instance()
