"""Publication Scheduler - Posts approved clips at optimal times.

Default EtoStark schedule: 3 posts/day at 12:00, 18:00, 21:00 (Paris time).
Only posts clips with status "approved" or "scheduled".

Also exposes a general-purpose job queue (`PublishScheduler`) that stores
user-scheduled publish jobs with an explicit future datetime and processes
them when due. Used by the SocialPublishModal when the user picks a
specific time.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any, Optional

from forge_engine.core.config import settings
from forge_engine.core.database import async_session_maker

logger = logging.getLogger(__name__)


_SCHEDULE_FILE = settings.LIBRARY_PATH / "publish_schedule.json"


# Default publication schedule (24h format, Europe/Paris)
DEFAULT_SCHEDULE = {
    "slots": [
        {"hour": 12, "minute": 0},   # Lunch break engagement
        {"hour": 18, "minute": 0},   # After work/school
        {"hour": 21, "minute": 0},   # Prime time
    ],
    "max_posts_per_day": 3,
    "min_interval_minutes": 120,  # At least 2h between posts
    "platforms": ["youtube"],     # Start with YouTube, add TikTok later
}


class PublishSchedulerService:
    """Scheduler that publishes approved clips at optimal times."""

    _instance: Optional["PublishSchedulerService"] = None

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._schedule = DEFAULT_SCHEDULE
        self._posts_today: int = 0
        self._last_post_time: datetime | None = None
        self._today_date: str | None = None

    @classmethod
    def get_instance(cls) -> "PublishSchedulerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start(self):
        """Start the scheduler background loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info("[Scheduler] Started - checking every 5 minutes")

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("[Scheduler] Stopped")

    async def _scheduler_loop(self):
        """Check every 5 minutes if it's time to publish."""
        await asyncio.sleep(60)  # Wait for startup

        while self._running:
            try:
                await self._check_and_publish()
            except Exception as e:
                logger.error(f"[Scheduler] Error: {e}")

            await asyncio.sleep(300)  # Check every 5 minutes

    async def _check_and_publish(self):
        """Check if now is a good time to publish a clip."""
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")

        # Reset daily counter
        if self._today_date != today:
            self._today_date = today
            self._posts_today = 0

        # Check daily limit
        if self._posts_today >= self._schedule["max_posts_per_day"]:
            return

        # Check minimum interval
        if self._last_post_time:
            min_interval = timedelta(minutes=self._schedule["min_interval_minutes"])
            if now - self._last_post_time < min_interval:
                return

        # Check if current time is near a slot
        current_time = now.time()
        is_slot_time = False

        for slot in self._schedule["slots"]:
            slot_time = time(slot["hour"], slot["minute"])
            # Allow 10-minute window after slot time
            slot_start = datetime.combine(now.date(), slot_time)
            slot_end = slot_start + timedelta(minutes=10)

            if slot_start.time() <= current_time <= slot_end.time():
                is_slot_time = True
                break

        if not is_slot_time:
            return

        # Find the next clip to publish
        await self._publish_next_clip()

    async def _publish_next_clip(self):
        """Find and publish the next approved clip."""
        from sqlalchemy import or_, select

        from forge_engine.models.review import ClipQueue

        async with async_session_maker() as db:
            # Get the highest-scored approved or scheduled clip
            result = await db.execute(
                select(ClipQueue)
                .where(
                    or_(
                        ClipQueue.status == "approved",
                        ClipQueue.status == "scheduled",
                    )
                )
                .order_by(ClipQueue.viral_score.desc())
                .limit(1)
            )
            clip = result.scalar_one_or_none()

            if not clip:
                return  # No clips to publish

            logger.info(f"[Scheduler] Publishing clip: '{clip.title}' (score={clip.viral_score:.0f})")

            # Attempt publication
            try:
                from forge_engine.services.social_publish import (
                    Platform,
                    PublishRequest,
                    SocialPublishService,
                )

                publish_service = SocialPublishService.get_instance()
                platform = clip.target_platform or "youtube"

                request = PublishRequest(
                    video_path=clip.video_path,
                    title=clip.title or "Clip",
                    description=clip.description or "",
                    hashtags=clip.hashtags or [],
                    platform=Platform(platform),
                )

                result = await publish_service.publish(request)

                if result.success:
                    clip.status = "published"
                    clip.published_at = datetime.utcnow()
                    clip.published_url = result.video_url
                    self._posts_today += 1
                    self._last_post_time = datetime.now()

                    logger.info(f"[Scheduler] Published: {result.video_url}")
                else:
                    clip.status = "failed"
                    clip.publish_error = result.error
                    logger.error(f"[Scheduler] Publish failed: {result.error}")

            except Exception as e:
                clip.status = "failed"
                clip.publish_error = str(e)[:500]
                logger.error(f"[Scheduler] Publish error: {e}")

            await db.commit()

    def get_status(self) -> dict[str, Any]:
        """Get scheduler status."""
        now = datetime.now()

        # Find next slot
        next_slot = None
        for slot in self._schedule["slots"]:
            slot_time = time(slot["hour"], slot["minute"])
            slot_dt = datetime.combine(now.date(), slot_time)
            if slot_dt > now:
                next_slot = slot_dt.isoformat()
                break

        if not next_slot and self._schedule["slots"]:
            # Next slot is tomorrow
            first_slot = self._schedule["slots"][0]
            next_slot = datetime.combine(
                now.date() + timedelta(days=1),
                time(first_slot["hour"], first_slot["minute"])
            ).isoformat()

        return {
            "running": self._running,
            "postsToday": self._posts_today,
            "maxPostsPerDay": self._schedule["max_posts_per_day"],
            "lastPostTime": self._last_post_time.isoformat() if self._last_post_time else None,
            "nextSlot": next_slot,
            "slots": self._schedule["slots"],
            "platforms": self._schedule["platforms"],
        }


class PublishScheduler:
    """Queue of user-scheduled publish jobs with an explicit future datetime.

    Stores jobs in a JSON file under the library path and processes them in
    a background loop. Each job is a pending social publication that will
    fire at or after its `publish_at` timestamp using `SocialPublishService`.
    """

    _instance: Optional["PublishScheduler"] = None
    _task: Optional[asyncio.Task] = None

    def __init__(self):
        self.scheduled: list[dict] = self._load()

    @classmethod
    def get_instance(cls) -> "PublishScheduler":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load(self) -> list[dict]:
        if not _SCHEDULE_FILE.exists():
            return []
        try:
            data = json.loads(_SCHEDULE_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception as e:
            logger.warning("Failed to load schedule file: %s", e)
            return []

    def _save(self) -> None:
        try:
            _SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
            _SCHEDULE_FILE.write_text(
                json.dumps(self.scheduled, default=str, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error("Failed to save schedule: %s", e)

    def schedule(
        self,
        artifact_id: str,
        project_id: str,
        platform: str,
        title: str,
        description: str,
        hashtags: list[str],
        publish_at: datetime,
        visibility: str = "public",
    ) -> str:
        entry = {
            "id": str(uuid.uuid4()),
            "artifact_id": artifact_id,
            "project_id": project_id,
            "platform": platform,
            "title": title,
            "description": description,
            "hashtags": hashtags,
            "publish_at": publish_at.isoformat(),
            "visibility": visibility,
            "status": "scheduled",
            "created_at": datetime.utcnow().isoformat(),
        }
        self.scheduled.append(entry)
        self._save()
        return entry["id"]

    def cancel(self, schedule_id: str) -> bool:
        for i, entry in enumerate(self.scheduled):
            if entry["id"] == schedule_id:
                self.scheduled.pop(i)
                self._save()
                return True
        return False

    def list_pending(self) -> list[dict]:
        return [e for e in self.scheduled if e.get("status") == "scheduled"]

    async def start(self) -> None:
        """Start the background scheduler loop."""
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop())
        logger.info("[PublishScheduler] Started - queue check every 60s")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
            logger.info("[PublishScheduler] Stopped")

    async def _loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                now = datetime.utcnow()
                for entry in list(self.scheduled):
                    if entry.get("status") != "scheduled":
                        continue
                    try:
                        publish_time = datetime.fromisoformat(entry["publish_at"])
                    except (KeyError, ValueError):
                        continue
                    # Compare naive UTC (frontend sends ISO with Z which fromisoformat
                    # accepts as tz-aware in 3.11+; normalize both sides to naive UTC)
                    if publish_time.tzinfo is not None:
                        publish_time = publish_time.replace(tzinfo=None)
                    if publish_time <= now:
                        await self._publish(entry)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("[PublishScheduler] Loop error: %s", e)

    async def _publish(self, entry: dict) -> None:
        try:
            from sqlalchemy import select

            from forge_engine.models.artifact import Artifact
            from forge_engine.services.social_publish import (
                Platform,
                PublishRequest,
                SocialPublishService,
            )

            service = SocialPublishService.get_instance()

            artifact_path = entry.get("artifact_path")
            if not artifact_path:
                async with async_session_maker() as db:
                    result = await db.execute(
                        select(Artifact).where(Artifact.id == entry["artifact_id"])
                    )
                    artifact = result.scalar_one_or_none()
                    if not artifact:
                        entry["status"] = "failed"
                        entry["error"] = "Artifact not found"
                        self._save()
                        return
                    artifact_path = artifact.path

            req = PublishRequest(
                video_path=artifact_path,
                title=entry["title"],
                description=entry["description"],
                hashtags=entry["hashtags"],
                platform=Platform(entry["platform"]),
                privacy=entry.get("visibility", "public"),
            )
            result = await service.publish(req)
            entry["status"] = "published" if result.success else "failed"
            entry["video_url"] = result.video_url
            entry["error"] = result.error
            entry["published_at"] = datetime.utcnow().isoformat()
            self._save()
            logger.info(
                "[PublishScheduler] Scheduled publish %s -> %s",
                entry["id"],
                entry["status"],
            )
        except Exception as e:
            entry["status"] = "failed"
            entry["error"] = str(e)[:500]
            self._save()
            logger.error("[PublishScheduler] Publish error: %s", e)
