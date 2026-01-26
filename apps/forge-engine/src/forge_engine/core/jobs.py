"""Job queue manager for background processing (Persistent Version)."""

import asyncio
import logging
import uuid
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional

from sqlalchemy import select, update
from forge_engine.core.database import async_session_maker
from forge_engine.models.job import JobRecord

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    """Job type enumeration."""
    INGEST = "ingest"
    ANALYZE = "analyze"
    DOWNLOAD = "download"
    RENDER_PROXY = "render_proxy"
    RENDER_FINAL = "render_final"
    GENERATE_VARIANTS = "generate_variants"
    EXPORT = "export"


# Job priority (lower = higher priority)
JOB_PRIORITY = {
    JobType.DOWNLOAD.value: 1,   # Downloads first (user is waiting)
    JobType.INGEST.value: 2,     # Then ingest (enables analysis)
    JobType.EXPORT.value: 3,     # Exports are user-initiated
    JobType.RENDER_FINAL.value: 4,
    JobType.ANALYZE.value: 5,    # Analysis can be queued
    JobType.RENDER_PROXY.value: 6,
    JobType.GENERATE_VARIANTS.value: 7,
}


@dataclass
class Job:
    """Represents a background job (Transient Object)."""
    id: str
    type: JobType
    project_id: Optional[str] = None
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    stage: str = ""
    message: str = ""
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Internal - loaded from registry
    _handler: Optional[Callable[..., Coroutine]] = field(default=None, repr=False)
    _kwargs: Dict[str, Any] = field(default_factory=dict, repr=False)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "type": self.type.value if isinstance(self.type, JobType) else self.type,
            "project_id": self.project_id,
            "status": self.status.value if isinstance(self.status, JobStatus) else self.status,
            "progress": self.progress,
            "stage": self.stage,
            "message": self.message,
            "error": self.error,
            "result": self.result,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class JobManager:
    """Manages background job execution with SQLite persistence."""
    
    _instance: Optional["JobManager"] = None
    
    # Timeout settings per job type (in seconds)
    JOB_TIMEOUTS = {
        JobType.DOWNLOAD.value: 3600,      # 1 hour for downloads
        JobType.INGEST.value: 7200,        # 2 hours for ingestion
        JobType.ANALYZE.value: 14400,      # 4 hours for analysis (large videos)
        JobType.EXPORT.value: 1800,        # 30 min for export
        JobType.RENDER_FINAL.value: 3600,  # 1 hour for final render
        JobType.RENDER_PROXY.value: 600,   # 10 min for proxy
        JobType.GENERATE_VARIANTS.value: 1800,
    }
    
    # Stall detection: if no progress for this many seconds, mark as stalled
    STALL_THRESHOLD = 300  # 5 minutes
    
    def __init__(self):
        self._handlers: Dict[str, Callable] = {}
        self._running = False
        self._workers: List[asyncio.Task] = []
        # Allow 2 workers for parallel project processing
        # Worker 0: High priority (downloads, ingests, exports)
        # Worker 1: Low priority (analysis, rendering)
        self._max_workers = 2
        self._listeners: Dict[str, List[Callable[[Job], None]]] = {}
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None
        self._last_progress: Dict[str, tuple] = {}  # job_id -> (progress, timestamp)
    
    def set_main_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Store reference to main event loop for thread-safe updates."""
        self._main_loop = loop
        logger.info("JobManager main loop registered")
    
    @classmethod
    def get_instance(cls) -> "JobManager":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def register_handler(self, job_type: JobType, handler: Callable[..., Coroutine]):
        """Register a handler for a job type."""
        self._handlers[job_type.value] = handler
        logger.info("Registered handler for %s", job_type.value)
    
    async def start(self) -> None:
        """Start the job manager workers."""
        if self._running:
            return
        
        self._running = True
        
        # Reset any stuck "running" jobs to "pending" on startup
        async with async_session_maker() as db:
            await db.execute(
                update(JobRecord)
                .where(JobRecord.status == JobStatus.RUNNING.value)
                .values(status=JobStatus.PENDING.value)
            )
            await db.commit()
            logger.info("Reset stuck jobs to pending")

        for i in range(self._max_workers):
            worker = asyncio.create_task(self._worker(i))
            self._workers.append(worker)
        
        # Start stall/timeout monitor
        monitor_task = asyncio.create_task(self._monitor_stuck_jobs())
        self._workers.append(monitor_task)
        
        logger.info("Persistent Job manager started with %d workers + monitor", self._max_workers)
    
    async def stop(self) -> None:
        """Stop the job manager."""
        self._running = False
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        logger.info("Job manager stopped")
    
    async def _worker(self, worker_id: int) -> None:
        """Worker loop polling DB with priority-based job selection."""
        logger.info("Worker %d started", worker_id)
        
        # Worker 0 handles high-priority jobs, Worker 1 handles any
        high_priority_types = [JobType.DOWNLOAD.value, JobType.INGEST.value, JobType.EXPORT.value]
        
        while self._running:
            try:
                job_id = None
                handler = None
                kwargs = {}
                
                # Transaction to get and lock next job
                async with async_session_maker() as db:
                    # Find pending jobs created in last 24 hours
                    cutoff = datetime.utcnow() - timedelta(hours=24)
                    
                    # Build query with priority ordering
                    from sqlalchemy import case
                    
                    # Create priority expression for SQL ordering
                    priority_order = case(
                        {
                            JobType.DOWNLOAD.value: 1,
                            JobType.INGEST.value: 2,
                            JobType.EXPORT.value: 3,
                            JobType.RENDER_FINAL.value: 4,
                            JobType.ANALYZE.value: 5,
                            JobType.RENDER_PROXY.value: 6,
                            JobType.GENERATE_VARIANTS.value: 7,
                        },
                        value=JobRecord.type,
                        else_=10
                    )
                    
                    # Worker 0: prioritize high-priority jobs
                    # Worker 1+: take any available job
                    if worker_id == 0:
                        # High-priority worker - prefer downloads/ingests/exports
                        result = await db.execute(
                            select(JobRecord)
                            .where(JobRecord.status == JobStatus.PENDING.value)
                            .where(JobRecord.created_at > cutoff)
                            .where(JobRecord.type.in_(high_priority_types))
                            .order_by(priority_order, JobRecord.created_at)
                            .limit(1)
                        )
                        record = result.scalar_one_or_none()
                        
                        # If no high-priority jobs, fall back to any
                        if not record:
                            result = await db.execute(
                                select(JobRecord)
                                .where(JobRecord.status == JobStatus.PENDING.value)
                                .where(JobRecord.created_at > cutoff)
                                .order_by(priority_order, JobRecord.created_at)
                                .limit(1)
                            )
                            record = result.scalar_one_or_none()
                    else:
                        # Other workers - take any job by priority
                        result = await db.execute(
                            select(JobRecord)
                            .where(JobRecord.status == JobStatus.PENDING.value)
                            .where(JobRecord.created_at > cutoff)
                            .order_by(priority_order, JobRecord.created_at)
                            .limit(1)
                        )
                        record = result.scalar_one_or_none()
                    
                    if record:
                        job_id = record.id
                        job_type = record.type
                        project_id = record.project_id
                        kwargs = record.result if record.result else {}
                        
                        # Lock it
                        record.status = JobStatus.RUNNING.value
                        record.started_at = datetime.utcnow()
                        await db.commit()
                        
                        priority = JOB_PRIORITY.get(job_type, 10)
                        logger.info("Worker %d picked up job %s (%s, priority=%d)", 
                                   worker_id, job_id[:8], job_type, priority)
                        
                        handler = self._handlers.get(job_type)
                
                if job_id and handler:
                    # Reconstruct transient Job object for the handler
                    job = Job(
                        id=job_id,
                        type=JobType(job_type),
                        project_id=project_id,
                        status=JobStatus.RUNNING,
                        _handler=handler,
                        _kwargs=kwargs
                    )
                    
                    await self._execute_job(job)
                else:
                    # No job, sleep (worker 1 sleeps a bit longer)
                    await asyncio.sleep(1 if worker_id == 0 else 3)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Worker %d loop error: %s", worker_id, e)
                await asyncio.sleep(5)
    
    async def _execute_job(self, job: Job) -> None:
        """Execute job logic."""
        try:
            # Re-fetch args from DB just in case
            async with async_session_maker() as db:
                result = await db.execute(select(JobRecord).where(JobRecord.id == job.id))
                record = result.scalar_one()
                # We interpret 'result' column as input args for pending jobs
                # This is a bit hacky but avoids schema migration for now
                # Ideally we should have a 'payload' column
                args = record.result or {}
                job._kwargs = args

            if job._handler:
                # Pass project_id explicitly since it's stored separately from kwargs
                result = await job._handler(job=job, project_id=job.project_id, **job._kwargs)
                
                # Update success
                async with async_session_maker() as db:
                    await db.execute(
                        update(JobRecord)
                        .where(JobRecord.id == job.id)
                        .values(
                            status=JobStatus.COMPLETED.value,
                            progress=100.0,
                            result=result or {},
                            completed_at=datetime.utcnow()
                        )
                    )
                    await db.commit()
                logger.info("Job %s completed successfully", job.id)
            else:
                raise ValueError(f"No handler for job type {job.type}")

        except Exception as e:
            logger.exception("Job %s failed: %s", job.id, e)
            async with async_session_maker() as db:
                await db.execute(
                    update(JobRecord)
                    .where(JobRecord.id == job.id)
                    .values(
                        status=JobStatus.FAILED.value,
                        error=str(e),
                        completed_at=datetime.utcnow()
                    )
                )
                await db.commit()
        
        self._notify_listeners(job)

    async def create_job(
        self,
        job_type: JobType,
        handler: Optional[Callable[..., Coroutine]] = None,
        project_id: Optional[str] = None,
        **kwargs
    ) -> Job:
        """Create job in DB. Uses registered handler if none provided."""
        # Register handler if provided, otherwise verify one exists
        if handler:
            self.register_handler(job_type, handler)
        elif job_type.value not in self._handlers:
            raise ValueError(f"No handler registered for job type: {job_type.value}")
        
        async with async_session_maker() as db:
            record = JobRecord(
                type=job_type.value,
                project_id=project_id,
                status=JobStatus.PENDING.value,
                # Store args in result column for now (hack)
                result=kwargs, 
                created_at=datetime.utcnow()
            )
            db.add(record)
            await db.commit()
            await db.refresh(record)
            
            logger.info("Created persistent job %s", record.id)
            
            # Return transient object
            return Job(
                id=record.id,
                type=job_type,
                project_id=project_id,
                status=JobStatus.PENDING,
                created_at=record.created_at
            )

    async def get_job(self, job_id: str) -> Optional[Job]:
        """Fetch job from DB."""
        async with async_session_maker() as db:
            result = await db.execute(select(JobRecord).where(JobRecord.id == job_id))
            record = result.scalar_one_or_none()
            if not record:
                return None
            
            return Job(
                id=record.id,
                type=JobType(record.type),
                project_id=record.project_id,
                status=JobStatus(record.status),
                progress=record.progress,
                stage=record.stage or "",
                message=record.message or "",
                error=record.error,
                result=record.result,
                created_at=record.created_at,
                started_at=record.started_at,
                completed_at=record.completed_at
            )

    async def get_jobs_for_project(self, project_id: str) -> List[Job]:
        """Fetch jobs for project."""
        async with async_session_maker() as db:
            result = await db.execute(
                select(JobRecord)
                .where(JobRecord.project_id == project_id)
                .order_by(JobRecord.created_at.desc())
            )
            records = result.scalars().all()
            return [
                Job(
                    id=r.id,
                    type=JobType(r.type),
                    project_id=r.project_id,
                    status=JobStatus(r.status),
                    progress=r.progress,
                    stage=r.stage or "",
                    message=r.message or "",
                    error=r.error,
                    result=r.result,
                    created_at=r.created_at
                ) for r in records
            ]

    async def get_all_jobs(self, limit: int = 100) -> List[Job]:
        """Fetch all jobs (most recent first)."""
        async with async_session_maker() as db:
            result = await db.execute(
                select(JobRecord)
                .order_by(JobRecord.created_at.desc())
                .limit(limit)
            )
            records = result.scalars().all()
            return [
                Job(
                    id=r.id,
                    type=JobType(r.type),
                    project_id=r.project_id,
                    status=JobStatus(r.status),
                    progress=r.progress,
                    stage=r.stage or "",
                    message=r.message or "",
                    error=r.error,
                    result=r.result,
                    created_at=r.created_at
                ) for r in records
            ]

    def update_progress(self, job: Job, progress: float, stage: str = "", message: str = "") -> None:
        """Update progress in DB (synchronous wrapper calling async task)."""
        job.progress = progress
        job.stage = stage
        job.message = message
        
        # Notify L'ŒIL monitor for health tracking
        try:
            from forge_engine.services.monitor import MonitorService
            monitor = MonitorService.get_instance()
            job_type = job.type.value if isinstance(job.type, JobType) else job.type
            status = job.status.value if isinstance(job.status, JobStatus) else str(job.status)
            monitor.update_job_health(job.id, job_type, status, progress, job.started_at)
        except Exception:
            pass  # Don't fail job update if monitor fails
        
        # Notify listeners (including WebSocket)
        self._notify_listeners(job)
        
        # Fire and forget DB update - use thread-safe method
        try:
            loop = asyncio.get_running_loop()
            asyncio.create_task(self._update_db_progress(job.id, progress, stage, message))
        except RuntimeError:
            # No event loop in this thread (called from executor)
            # Use run_coroutine_threadsafe with the stored main loop
            if self._main_loop and self._main_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self._update_db_progress(job.id, progress, stage, message),
                    self._main_loop
                )
            else:
                logger.debug("Could not update DB progress: no main loop available")

    async def _update_db_progress(self, job_id: str, progress: float, stage: str, message: str):
        try:
            async with async_session_maker() as db:
                await db.execute(
                    update(JobRecord)
                    .where(JobRecord.id == job_id)
                    .values(
                        progress=progress,
                        stage=stage,
                        message=message
                    )
                )
                await db.commit()
        except Exception as e:
            logger.error("Failed to update progress for %s: %s", job_id, e)

    async def cancel_job(self, job_id: str) -> bool:
        async with async_session_maker() as db:
            await db.execute(
                update(JobRecord)
                .where(JobRecord.id == job_id)
                .values(status=JobStatus.CANCELLED.value, completed_at=datetime.utcnow())
            )
            await db.commit()
        logger.info("Job %s cancelled", job_id)
        return True
    
    async def retry_job(self, job_id: str) -> Optional[Job]:
        """Retry a failed or cancelled job by resetting it to pending."""
        async with async_session_maker() as db:
            result = await db.execute(select(JobRecord).where(JobRecord.id == job_id))
            record = result.scalar_one_or_none()
            
            if not record:
                return None
            
            if record.status not in [JobStatus.FAILED.value, JobStatus.CANCELLED.value]:
                logger.warning("Cannot retry job %s with status %s", job_id, record.status)
                return None
            
            # Reset to pending
            record.status = JobStatus.PENDING.value
            record.progress = 0.0
            record.error = None
            record.started_at = None
            record.completed_at = None
            record.stage = ""
            record.message = "Retrying..."
            
            await db.commit()
            await db.refresh(record)
            
            logger.info("Job %s reset to pending for retry", job_id)
            
            return Job(
                id=record.id,
                type=JobType(record.type),
                project_id=record.project_id,
                status=JobStatus.PENDING,
                created_at=record.created_at
            )
    
    async def _monitor_stuck_jobs(self) -> None:
        """Monitor for stuck/stalled jobs and handle timeouts."""
        logger.info("Job stall monitor started")
        
        while self._running:
            try:
                await asyncio.sleep(60)  # Check every minute
                
                async with async_session_maker() as db:
                    # Find running jobs
                    result = await db.execute(
                        select(JobRecord).where(JobRecord.status == JobStatus.RUNNING.value)
                    )
                    running_jobs = result.scalars().all()
                    
                    now = datetime.utcnow()
                    
                    for record in running_jobs:
                        job_id = record.id
                        job_type = record.type
                        started_at = record.started_at
                        progress = record.progress
                        
                        # Check timeout
                        timeout = self.JOB_TIMEOUTS.get(job_type, 7200)  # Default 2h
                        if started_at and (now - started_at).total_seconds() > timeout:
                            logger.warning("Job %s timed out (>%ds)", job_id[:8], timeout)
                            await db.execute(
                                update(JobRecord)
                                .where(JobRecord.id == job_id)
                                .values(
                                    status=JobStatus.FAILED.value,
                                    error=f"Timeout: job exceeded {timeout//60} minutes",
                                    completed_at=now
                                )
                            )
                            await db.commit()
                            continue
                        
                        # Check stall (no progress for STALL_THRESHOLD seconds)
                        last_progress_data = self._last_progress.get(job_id)
                        if last_progress_data:
                            last_progress, last_time = last_progress_data
                            if progress == last_progress and (now - last_time).total_seconds() > self.STALL_THRESHOLD:
                                logger.warning("Job %s stalled at %.1f%% for >%ds", 
                                             job_id[:8], progress, self.STALL_THRESHOLD)
                                # Mark as failed with stall error
                                await db.execute(
                                    update(JobRecord)
                                    .where(JobRecord.id == job_id)
                                    .values(
                                        status=JobStatus.FAILED.value,
                                        error=f"Stalled: no progress for {self.STALL_THRESHOLD//60} minutes at {progress:.0f}%",
                                        completed_at=now
                                    )
                                )
                                await db.commit()
                                del self._last_progress[job_id]
                                continue
                        
                        # Update last known progress
                        self._last_progress[job_id] = (progress, now)
                    
                    # Clean up old entries from _last_progress
                    completed_ids = set()
                    for job_id in list(self._last_progress.keys()):
                        result = await db.execute(
                            select(JobRecord.status).where(JobRecord.id == job_id)
                        )
                        status = result.scalar_one_or_none()
                        if status and status != JobStatus.RUNNING.value:
                            completed_ids.add(job_id)
                    
                    for job_id in completed_ids:
                        del self._last_progress[job_id]
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Job monitor error: %s", e)
                await asyncio.sleep(30)

    async def get_running_jobs_count(self) -> int:
        """Get count of currently running jobs."""
        async with async_session_maker() as db:
            from sqlalchemy import func
            result = await db.execute(
                select(func.count(JobRecord.id))
                .where(JobRecord.status == JobStatus.RUNNING.value)
            )
            return result.scalar() or 0
    
    async def get_pending_jobs_count(self) -> int:
        """Get count of pending jobs."""
        async with async_session_maker() as db:
            from sqlalchemy import func
            result = await db.execute(
                select(func.count(JobRecord.id))
                .where(JobRecord.status == JobStatus.PENDING.value)
            )
            return result.scalar() or 0
    
    async def get_jobs_stats(self) -> dict:
        """Get job statistics."""
        async with async_session_maker() as db:
            from sqlalchemy import func
            result = await db.execute(
                select(
                    JobRecord.status,
                    func.count(JobRecord.id).label("count")
                ).group_by(JobRecord.status)
            )
            stats = {"pending": 0, "running": 0, "completed": 0, "failed": 0, "cancelled": 0}
            for row in result.all():
                stats[row.status] = row.count
            return stats
    
    def register_global_listener(self, callback: Callable[[Job], None]) -> None:
        """Register a listener for ALL job updates."""
        if "global" not in self._listeners:
            self._listeners["global"] = []
        self._listeners["global"].append(callback)

    def _notify_listeners(self, job: Job) -> None:
        """Notify all listeners of a job update."""
        # Specific job listeners
        for callback in self._listeners.get(job.id, []):
            try:
                callback(job)
            except Exception as e:
                logger.exception("Listener error: %s", e)
        
        # Global listeners
        global_listeners = self._listeners.get("global", [])
        if global_listeners and job.progress % 5 < 0.5:  # Log every ~5%
            logger.info("Notifying %d global listeners for job %s (%.1f%%)", 
                       len(global_listeners), job.id[:8], job.progress)
        for callback in global_listeners:
            try:
                callback(job)
            except Exception as e:
                logger.exception("Global listener error: %s", e)
