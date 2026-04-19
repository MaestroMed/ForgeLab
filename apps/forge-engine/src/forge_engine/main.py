"""FORGE Engine - Main FastAPI Application."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from forge_engine.api.v1.router import api_router
from forge_engine.api.v2.router import v2_router
from forge_engine.core.config import settings
from forge_engine.core.database import close_db, init_db
from forge_engine.core.jobs import JobManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def cleanup_orphan_ffmpeg():
    """Kill orphan FFmpeg processes from previous runs."""
    import platform
    if platform.system() == "Windows":
        try:
            proc = await asyncio.create_subprocess_exec(
                "taskkill", "/F", "/IM", "ffmpeg.exe",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            await proc.wait()
            if proc.returncode == 0:
                logger.info("Cleaned up orphan FFmpeg processes")
        except Exception as e:
            logger.debug("No orphan FFmpeg to clean: %s", e)


async def cleanup_old_previews():
    """Delete preview files older than 24h from TEMP_PATH/previews."""
    import time
    try:
        preview_dir = settings.TEMP_PATH / "previews"
        if not preview_dir.exists():
            return
        now = time.time()
        deleted = 0
        for f in preview_dir.glob("*.mp4"):
            try:
                if now - f.stat().st_mtime > 86400:  # 24h
                    f.unlink()
                    deleted += 1
            except Exception:
                pass
        if deleted > 0:
            logger.info("Cleaned up %d old preview files", deleted)
    except Exception as e:
        logger.debug("Preview cleanup failed: %s", e)


async def cleanup_old_hook_cache():
    """Delete LLM hook cache entries older than 7 days from TEMP_PATH/hook_llm_cache."""
    import time
    try:
        cache_dir = settings.TEMP_PATH / "hook_llm_cache"
        if not cache_dir.exists():
            return
        now = time.time()
        deleted = 0
        # Clean any cached file regardless of extension — the cache service picks
        # names, so just match everything that's a regular file.
        for f in cache_dir.glob("*"):
            if not f.is_file():
                continue
            try:
                if now - f.stat().st_mtime > 7 * 86400:  # 7 days
                    f.unlink()
                    deleted += 1
            except Exception:
                pass
        if deleted > 0:
            logger.info("Cleaned up %d old hook LLM cache entries", deleted)
    except Exception as e:
        logger.debug("Hook LLM cache cleanup failed: %s", e)


async def prewarm_llm():
    """Prewarm the LLM by loading the model with a dummy request.

    First-request latency is dominated by Ollama loading the model into VRAM;
    fire a trivial generation at startup so the model is hot when the user
    actually needs it.
    """
    try:
        from forge_engine.services.llm_local import LocalLLMService
        llm = LocalLLMService.get_instance()
        if await llm.check_availability():
            await llm.generate("Say OK.", max_tokens=10, temperature=0.0)
            logger.info("LLM prewarmed with model %s", llm._current_model)
    except Exception as e:
        logger.debug("LLM prewarm skipped: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    logger.info("Starting FORGE Engine v%s", settings.VERSION)

    # Clean up any orphan FFmpeg processes from crashed runs
    await cleanup_orphan_ffmpeg()

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Start job manager
    job_manager = JobManager.get_instance()

    # Register WebSocket listener and set main loop for thread-safe callbacks
    from forge_engine.api.v1.endpoints.websockets import job_update_listener, set_main_loop
    main_loop = asyncio.get_running_loop()
    set_main_loop(main_loop)
    job_manager.set_main_loop(main_loop)  # Also store in JobManager for DB updates
    job_manager.register_global_listener(job_update_listener)

    # Register job handlers
    from forge_engine.core.jobs import JobType
    from forge_engine.services.analysis import AnalysisService
    from forge_engine.services.export import ExportService
    from forge_engine.services.ingest import IngestService
    from forge_engine.services.youtube_dl import YouTubeDLService

    ingest_service = IngestService()
    analysis_service = AnalysisService()
    export_service = ExportService()
    youtube_service = YouTubeDLService.get_instance()

    # Download handler for URL imports
    async def download_handler(job, project_id: str = None, **kwargs):
        """Handle download jobs from URL imports."""
        from sqlalchemy import select

        from forge_engine.core.config import settings
        from forge_engine.core.database import async_session_maker
        from forge_engine.models import Project

        job_manager_instance = JobManager.get_instance()

        url = kwargs.get("url")
        quality = kwargs.get("quality", "best")
        auto_ingest = kwargs.get("auto_ingest", True)
        auto_analyze = kwargs.get("auto_analyze", True)

        if not url:
            raise ValueError("No URL provided for download")

        async with async_session_maker() as db:
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()

            if not project:
                raise ValueError(f"Project not found: {project_id}")

            # Setup project directory
            project_dir = settings.LIBRARY_PATH / "projects" / project.id
            source_dir = project_dir / "source"
            source_dir.mkdir(parents=True, exist_ok=True)

            def progress_callback(pct, msg):
                job_manager_instance.update_progress(job, pct * 0.9, "download", msg)

            # Download video
            downloaded_path = await youtube_service.download_video(
                url=url,
                output_dir=source_dir,
                quality=quality,
                progress_callback=progress_callback
            )

            if not downloaded_path or not downloaded_path.exists():
                raise ValueError("Download failed - no file created")

            # Update project with source path
            project.source_path = str(downloaded_path)
            project.source_filename = downloaded_path.name
            project.status = "pending"
            await db.commit()

            job_manager_instance.update_progress(job, 95, "complete", "Téléchargement terminé")

            # Auto-chain to ingest if requested
            if auto_ingest:
                ingest_job = await job_manager_instance.create_job(
                    job_type=JobType.INGEST,
                    project_id=project.id,
                    auto_analyze=auto_analyze
                )
                logger.info("Created ingest job %s for project %s", ingest_job.id, project.id)

            return {"downloaded_path": str(downloaded_path)}

    job_manager.register_handler(JobType.DOWNLOAD, download_handler)
    job_manager.register_handler(JobType.INGEST, ingest_service.run_ingest)
    job_manager.register_handler(JobType.ANALYZE, analysis_service.run_analysis)
    job_manager.register_handler(JobType.EXPORT, export_service.run_export)

    asyncio.create_task(job_manager.start())
    logger.info("Job manager started")

    # Background housekeeping — never block startup on these.
    # Preview files: 24h TTL. Hook LLM cache: 7 days. Ollama prewarm: fire-and-forget.
    asyncio.create_task(cleanup_old_previews())
    asyncio.create_task(cleanup_old_hook_cache())
    asyncio.create_task(prewarm_llm())

    # Check FFmpeg
    from forge_engine.services.ffmpeg import FFmpegService
    ffmpeg = FFmpegService()
    if await ffmpeg.check_availability():
        logger.info("FFmpeg available - NVENC: %s", ffmpeg.has_nvenc)
    else:
        logger.warning("FFmpeg not found! Video processing will fail.")

    # Start L'ŒIL monitoring service
    from forge_engine.services.monitor import MonitorService
    monitor = MonitorService.get_instance()
    await monitor.start()
    logger.info("L'ŒIL monitoring service started")

    # Auto Pipeline and Publish Scheduler are available but not auto-started.
    # Enable manually via API: POST /v1/monitor/pipeline/start
    from forge_engine.services.auto_pipeline import AutoPipelineService
    auto_pipeline = AutoPipelineService.get_instance()
    logger.info("Auto Pipeline loaded (start via API when ready)")

    from forge_engine.services.publish_scheduler import (
        PublishScheduler,
        PublishSchedulerService,
    )
    scheduler = PublishSchedulerService.get_instance()
    logger.info("Publish Scheduler loaded (start via API when ready)")

    # Start the user-scheduled publish queue (fires one-off jobs at their time)
    publish_queue = PublishScheduler.get_instance()
    await publish_queue.start()

    yield

    # Cleanup
    logger.info("Shutting down FORGE Engine...")
    await publish_queue.stop()
    await scheduler.stop()
    await auto_pipeline.stop()
    await monitor.stop()
    await job_manager.stop()
    await close_db()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="FORGE Engine",
        description="Viral clip processing backend for FORGE/LAB",
        version=settings.VERSION,
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.DEBUG else settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        from forge_engine.services.ffmpeg import FFmpegService
        from forge_engine.services.transcription import TranscriptionService

        ffmpeg = FFmpegService()
        transcription = TranscriptionService()

        return {
            "status": "healthy",
            "version": settings.VERSION,
            "services": {
                "ffmpeg": await ffmpeg.check_availability(),
                "whisper": transcription.is_available(),
                "nvenc": ffmpeg.has_nvenc,
                "database": True,
            },
        }

    # Include API router
    app.include_router(api_router, prefix="/v1")

    # Include public API v2 (webhooks, external integrations)
    app.include_router(v2_router)

    # Mount static files for library (video serving)
    library_path = settings.LIBRARY_PATH
    if library_path.exists():
        app.mount("/library", StaticFiles(directory=str(library_path)), name="library")
        logger.info("Library mounted at /library: %s", library_path)

    # Serve clip queue videos (for mobile review app)
    @app.get("/clips/{clip_id}/video")
    async def serve_clip_video(clip_id: str):
        """Serve a queued clip's video file for mobile streaming."""
        from pathlib import Path

        from fastapi import HTTPException
        from sqlalchemy import select

        from forge_engine.core.database import async_session_maker
        from forge_engine.models.review import ClipQueue

        async with async_session_maker() as db:
            result = await db.execute(
                select(ClipQueue).where(ClipQueue.id == clip_id)
            )
            clip = result.scalar_one_or_none()

            if not clip:
                raise HTTPException(status_code=404, detail="Clip not found")

            video_path = Path(clip.video_path)
            if not video_path.exists():
                raise HTTPException(status_code=404, detail="Video file not found")

            return FileResponse(
                video_path,
                media_type="video/mp4",
                headers={
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                }
            )

    # Serve project files
    ALLOWED_MEDIA_TYPES = {"proxy", "audio"}

    @app.get("/media/{project_id}/{file_type}")
    async def serve_media(project_id: str, file_type: str):
        """Serve project media files (proxy, audio)."""
        import uuid as _uuid
        from pathlib import Path

        from fastapi import HTTPException

        # Validate project_id is a proper UUID to prevent path traversal
        try:
            _uuid.UUID(project_id)
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail="Invalid project ID")

        # Restrict file_type to allowed values
        if file_type not in ALLOWED_MEDIA_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_MEDIA_TYPES))}",
            )

        project_dir = library_path / "projects" / project_id

        # Verify resolved path is inside the library to block any traversal
        try:
            resolved_dir = Path(project_dir).resolve()
            resolved_library = Path(library_path).resolve()
            if not str(resolved_dir).startswith(str(resolved_library)):
                raise HTTPException(status_code=400, detail="Invalid project path")
        except (OSError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid project path")

        # Try multiple possible locations
        possible_paths = {
            "proxy": [
                project_dir / "proxy" / "proxy.mp4",
                project_dir / "proxy.mp4",
            ],
            "audio": [
                project_dir / "audio" / "audio.wav",
                project_dir / "audio.wav",
            ],
        }

        paths_to_try = possible_paths.get(file_type, [])

        for file_path in paths_to_try:
            if file_path.exists():
                media_type = "video/mp4" if file_type == "proxy" else "audio/wav"
                return FileResponse(file_path, media_type=media_type)

        # Log what we tried
        logger.warning("Media not found for %s/%s. Tried: %s", project_id, file_type, paths_to_try)
        raise HTTPException(status_code=404, detail=f"File not found: {file_type}")

    return app


# Create app instance
app = create_app()


def main():
    """Run the application."""
    import uvicorn

    uvicorn.run(
        "forge_engine.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )


if __name__ == "__main__":
    main()

