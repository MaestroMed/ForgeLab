"""One-click pipeline orchestrator.

Takes a URL/file + target platform, runs the entire production pipeline:
download -> ingest -> analyze -> auto-select -> export -> content gen -> schedule publish.

The orchestrator doesn't run the heavy lifting itself - it delegates to the real
services via ``JobManager.create_job`` and polls the resulting jobs to update a
high-level pipeline run record. This keeps behavior identical to what the
existing endpoints produce (jobs, progress events, WebSocket broadcasts, auto-
export rules, etc.) while exposing a single "one clip" surface to the UI.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------


@dataclass
class PipelinePreset:
    """Preset for the one-click pipeline."""

    name: str
    platform: str = "tiktok"
    target_count: int = 3         # Number of clips to produce
    min_score: float = 65.0       # Virality threshold for auto-selection
    min_duration: float = 30.0
    max_duration: float = 60.0
    include_captions: bool = True
    burn_subtitles: bool = True
    generate_content: bool = True  # LLM title/desc/hashtags
    schedule_publish: bool = False
    publish_interval_minutes: int = 30
    # Whisper model override (None = service default)
    whisper_model: str | None = None
    language: str = "fr"


BUILTIN_PRESETS: dict[str, PipelinePreset] = {
    "tiktok_quick": PipelinePreset(
        name="TikTok Rapide",
        platform="tiktok",
        target_count=3,
        min_score=65.0,
    ),
    "tiktok_premium": PipelinePreset(
        name="TikTok Premium",
        platform="tiktok",
        target_count=5,
        min_score=75.0,
        min_duration=40.0,
        max_duration=60.0,
    ),
    "youtube_shorts": PipelinePreset(
        name="YouTube Shorts",
        platform="youtube_shorts",
        target_count=3,
        min_score=65.0,
        min_duration=30.0,
        max_duration=60.0,
    ),
    "instagram_reels": PipelinePreset(
        name="Instagram Reels",
        platform="instagram_reels",
        target_count=3,
        min_score=65.0,
        min_duration=40.0,
        max_duration=90.0,
    ),
    "all_platforms": PipelinePreset(
        name="Multi-plateformes (TikTok + YT + IG)",
        platform="tiktok",  # Primary; exports also go to YT + IG via duplication
        target_count=3,
        min_score=70.0,
    ),
}


# ---------------------------------------------------------------------------
# Run state
# ---------------------------------------------------------------------------


@dataclass
class PipelineRun:
    """State of a running pipeline."""

    id: str
    preset: PipelinePreset
    project_id: str | None = None
    source_url: str | None = None
    source_file: str | None = None
    stage: str = "pending"
    # Supported stages:
    #   pending | downloading | ingesting | analyzing | exporting
    #   generating | publishing | completed | failed
    progress: float = 0.0
    message: str = ""
    error: str | None = None
    # Results
    created_project_id: str | None = None
    exported_artifacts: list[str] = field(default_factory=list)
    published_schedule_ids: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


# Poll interval while waiting for a child job to finish.
_JOB_POLL_INTERVAL = 2.0


class PipelineOrchestrator:
    """Orchestrates the end-to-end one-click pipeline."""

    _instance: Optional["PipelineOrchestrator"] = None

    def __init__(self) -> None:
        self._runs: dict[str, PipelineRun] = {}

    # --- Singleton ----------------------------------------------------------

    @classmethod
    def get_instance(cls) -> "PipelineOrchestrator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # --- Accessors ----------------------------------------------------------

    def get_preset(self, preset_id: str) -> PipelinePreset | None:
        return BUILTIN_PRESETS.get(preset_id)

    def get_run(self, run_id: str) -> PipelineRun | None:
        return self._runs.get(run_id)

    def list_runs(self) -> list[PipelineRun]:
        return list(self._runs.values())

    # --- Public kick-off ----------------------------------------------------

    async def start_from_url(
        self,
        url: str,
        preset_id: str = "tiktok_quick",
        channel_name: str | None = None,
    ) -> str:
        """Start a pipeline run from a video URL."""
        preset = self.get_preset(preset_id) or BUILTIN_PRESETS["tiktok_quick"]
        run_id = str(uuid.uuid4())
        run = PipelineRun(id=run_id, preset=preset, source_url=url)
        self._runs[run_id] = run

        asyncio.create_task(self._execute_url(run, url, channel_name))
        return run_id

    async def start_from_file(
        self,
        file_path: str,
        preset_id: str = "tiktok_quick",
        channel_name: str | None = None,
    ) -> str:
        """Start a pipeline run from a local file."""
        preset = self.get_preset(preset_id) or BUILTIN_PRESETS["tiktok_quick"]
        run_id = str(uuid.uuid4())
        run = PipelineRun(id=run_id, preset=preset, source_file=file_path)
        self._runs[run_id] = run

        asyncio.create_task(self._execute_file(run, file_path, channel_name))
        return run_id

    # --- URL flow -----------------------------------------------------------

    async def _execute_url(
        self,
        run: PipelineRun,
        url: str,
        channel_name: str | None,
    ) -> None:
        """Download then run the shared flow."""
        from forge_engine.core.config import settings
        from forge_engine.core.database import async_session_maker
        from forge_engine.models.project import Project
        from forge_engine.services.youtube_dl import YouTubeDLService

        try:
            run.stage = "downloading"
            run.progress = 2
            run.message = "Récupération des infos de la vidéo..."

            ytdl = YouTubeDLService.get_instance()
            info = await ytdl.get_video_info(url)
            title = (info.title if info else None) or "Untitled"
            platform = (info.platform if info else None) or "youtube"
            channel = channel_name or (info.channel if info else None)

            # Create project row up-front (mirrors /projects/import-url behavior)
            async with async_session_maker() as db:
                project = Project(
                    name=title,
                    source_path="",  # filled after download
                    source_filename=f"{title}.mp4",
                    status="downloading",
                    project_meta={
                        "importUrl": url,
                        "platform": platform,
                        "channel": channel,
                        "oneClickRunId": run.id,
                    },
                )
                db.add(project)
                await db.commit()
                await db.refresh(project)
                run.created_project_id = str(project.id)
                run.project_id = str(project.id)

            # Download into the project's source dir
            project_dir = settings.LIBRARY_PATH / "projects" / run.project_id
            source_dir = project_dir / "source"
            source_dir.mkdir(parents=True, exist_ok=True)

            def dl_progress(pct: float, msg: str) -> None:
                # Download takes ~0-30% of the overall pipeline progress.
                run.progress = 2 + max(0.0, min(pct, 100.0)) * 0.28
                run.message = msg

            run.message = "Téléchargement en cours..."
            downloaded_path = await ytdl.download_video(
                url, source_dir, "best", dl_progress
            )
            if not downloaded_path or not Path(downloaded_path).exists():
                raise RuntimeError("Téléchargement échoué")

            # Update project record with final path
            async with async_session_maker() as db:
                from sqlalchemy import select
                res = await db.execute(select(Project).where(Project.id == run.project_id))
                proj = res.scalar_one_or_none()
                if proj is not None:
                    proj.source_path = str(downloaded_path)
                    proj.source_filename = Path(downloaded_path).name
                    proj.status = "created"
                    await db.commit()

            run.progress = 30
            await self._run_ingest_analyze_export_publish(
                run, str(downloaded_path), channel
            )
        except Exception as e:  # noqa: BLE001 - top-level orchestration guard
            logger.exception("Pipeline URL flow failed")
            run.stage = "failed"
            run.error = str(e)
            run.message = f"Échec : {e}"

    # --- File flow ----------------------------------------------------------

    async def _execute_file(
        self,
        run: PipelineRun,
        file_path: str,
        channel_name: str | None,
    ) -> None:
        """Create a project from a local file then run the shared flow."""
        from forge_engine.core.database import async_session_maker
        from forge_engine.models.project import Project

        try:
            p = Path(file_path)
            if not p.exists():
                raise FileNotFoundError(f"Fichier introuvable: {file_path}")

            async with async_session_maker() as db:
                project = Project(
                    name=p.stem,
                    source_path=str(p),
                    source_filename=p.name,
                    status="created",
                    project_meta={
                        "channel": channel_name,
                        "oneClickRunId": run.id,
                    },
                )
                db.add(project)
                await db.commit()
                await db.refresh(project)
                run.created_project_id = str(project.id)
                run.project_id = str(project.id)

            run.progress = 30
            await self._run_ingest_analyze_export_publish(run, file_path, channel_name)
        except Exception as e:  # noqa: BLE001
            logger.exception("Pipeline file flow failed")
            run.stage = "failed"
            run.error = str(e)
            run.message = f"Échec : {e}"

    # --- Shared ingest -> publish -------------------------------------------

    async def _run_ingest_analyze_export_publish(
        self,
        run: PipelineRun,
        file_path: str,
        channel_name: str | None,
    ) -> None:
        """Run ingest -> analyze -> auto-select -> export -> content -> publish."""
        from forge_engine.core.database import async_session_maker
        from forge_engine.core.jobs import JobManager, JobStatus, JobType
        from forge_engine.models.segment import Segment
        from forge_engine.services.analysis import AnalysisService
        from forge_engine.services.export import ExportService
        from forge_engine.services.ingest import IngestService
        from sqlalchemy import desc, select

        job_manager = JobManager.get_instance()

        # -- Ingest --------------------------------------------------------
        run.stage = "ingesting"
        run.progress = 32
        run.message = "Préparation vidéo (proxy + audio)..."
        try:
            ingest_service = IngestService()
            ingest_job = await job_manager.create_job(
                job_type=JobType.INGEST,
                handler=ingest_service.run_ingest,
                project_id=run.project_id,
                create_proxy=True,
                extract_audio=True,
                normalize_audio=True,
                auto_analyze=False,  # we drive the analyze step ourselves
            )
            await self._wait_for_job(
                job_manager,
                ingest_job.id,
                progress_start=32,
                progress_end=50,
                run=run,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Ingest failed/skipped: %s", e)
            # Continue - analysis may still succeed if ingest already ran.

        # -- Analyze -------------------------------------------------------
        run.stage = "analyzing"
        run.progress = 50
        run.message = "Analyse IA (transcription + scoring)..."
        try:
            analysis_service = AnalysisService()
            analyze_job = await job_manager.create_job(
                job_type=JobType.ANALYZE,
                handler=analysis_service.run_analysis,
                project_id=run.project_id,
                transcribe=True,
                whisper_model=run.preset.whisper_model or "large-v3",
                language=run.preset.language,
                detect_scenes=True,
                analyze_audio=True,
                detect_faces=True,
                score_segments=True,
            )
            await self._wait_for_job(
                job_manager,
                analyze_job.id,
                progress_start=50,
                progress_end=75,
                run=run,
            )
        except Exception as e:  # noqa: BLE001
            logger.error("Analysis failed: %s", e)
            run.stage = "failed"
            run.error = f"Analyse échouée : {e}"
            run.message = run.error
            return

        # -- Auto-select ---------------------------------------------------
        run.stage = "exporting"
        run.progress = 75
        run.message = (
            f"Sélection des {run.preset.target_count} meilleurs segments..."
        )

        async with async_session_maker() as db:
            result = await db.execute(
                select(Segment)
                .where(Segment.project_id == run.project_id)
                .where(Segment.score_total >= run.preset.min_score)
                .order_by(desc(Segment.score_total))
                .limit(run.preset.target_count * 3)  # over-fetch for duration filter
            )
            all_segments = result.scalars().all()

        selected: list[Segment] = [
            s for s in all_segments
            if run.preset.min_duration <= s.duration <= run.preset.max_duration
        ][: run.preset.target_count]

        if not selected:
            run.stage = "failed"
            run.error = "Aucun segment ne correspond aux critères du preset"
            run.message = run.error
            return

        # -- Export each selected segment ---------------------------------
        export_service = ExportService()
        count = len(selected)
        for i, segment in enumerate(selected):
            run.message = f"Export {i + 1}/{count}..."
            # Slice the 75-90% band across exports.
            base_pct = 75 + ((i / count) * 15)
            run.progress = base_pct
            try:
                export_job = await job_manager.create_job(
                    job_type=JobType.EXPORT,
                    handler=export_service.run_export,
                    project_id=run.project_id,
                    segment_id=str(segment.id),
                    variant="A",
                    platform=run.preset.platform,
                    include_captions=run.preset.include_captions,
                    burn_subtitles=run.preset.burn_subtitles,
                    include_cover=True,
                    include_metadata=True,
                )
                await self._wait_for_job(
                    job_manager,
                    export_job.id,
                    progress_start=base_pct,
                    progress_end=75 + (((i + 1) / count) * 15),
                    run=run,
                )
                # Pull artifact ids back from the final job record
                final_job = await job_manager.get_job(export_job.id)
                if final_job and isinstance(final_job.result, dict):
                    artifacts = final_job.result.get("artifacts") or []
                    for a in artifacts:
                        if isinstance(a, dict) and a.get("type") == "video":
                            aid = a.get("id")
                            if aid:
                                run.exported_artifacts.append(str(aid))
                                break
            except Exception as e:  # noqa: BLE001
                logger.error("Export %d failed: %s", i, e)

        # -- Content generation -------------------------------------------
        if run.preset.generate_content:
            run.stage = "generating"
            run.progress = 92
            run.message = "Génération des titres et hashtags..."
            try:
                from forge_engine.services.content_generation import (
                    ContentGenerationService,
                )

                cg = ContentGenerationService.get_instance()
                for segment in selected:
                    await cg.generate_for_segment_full(
                        segment={
                            "transcript": segment.transcript or "",
                            "score": {
                                "tags": getattr(segment, "score_tags", []) or [],
                            },
                        },
                        platform=run.preset.platform,
                        channel_name=channel_name,
                    )
            except Exception as e:  # noqa: BLE001
                logger.warning("Content generation failed: %s", e)

        # -- Scheduled publishing -----------------------------------------
        if run.preset.schedule_publish and run.exported_artifacts:
            run.stage = "publishing"
            run.progress = 96
            run.message = "Planification des publications..."
            try:
                from forge_engine.services.publish_scheduler import PublishScheduler

                scheduler = PublishScheduler.get_instance()
                now = datetime.utcnow()
                for i, artifact_id in enumerate(run.exported_artifacts):
                    publish_at = now + timedelta(
                        minutes=run.preset.publish_interval_minutes * i
                    )
                    schedule_id = scheduler.schedule(
                        artifact_id=artifact_id,
                        project_id=run.project_id or "",
                        platform=run.preset.platform,
                        title="",
                        description="",
                        hashtags=[],
                        publish_at=publish_at,
                    )
                    run.published_schedule_ids.append(schedule_id)
            except Exception as e:  # noqa: BLE001
                logger.warning("Schedule failed: %s", e)

        run.stage = "completed"
        run.progress = 100
        run.message = f"{len(run.exported_artifacts)} clips prêts"

    # --- Helpers ------------------------------------------------------------

    async def _wait_for_job(
        self,
        job_manager: Any,
        job_id: str,
        progress_start: float,
        progress_end: float,
        run: PipelineRun,
    ) -> None:
        """Poll a child job until it terminates.

        While the child job is running, map its 0-100% progress onto the
        ``[progress_start, progress_end]`` slice of the overall pipeline
        progress bar so the UI stays smooth.

        Raises on FAILED / CANCELLED so the caller can decide whether the
        pipeline as a whole should abort.
        """
        # Lazy import to avoid circulars during module load
        from forge_engine.core.jobs import JobStatus

        terminal = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}
        while True:
            job = await job_manager.get_job(job_id)
            if job is None:
                # Record disappeared (e.g. old pruning) - treat as failure.
                raise RuntimeError(f"Job {job_id} disappeared")

            # Map inner progress onto the [progress_start, progress_end] slice.
            inner = max(0.0, min(float(job.progress or 0.0), 100.0))
            run.progress = progress_start + (inner / 100.0) * max(
                0.0, progress_end - progress_start
            )
            if job.message:
                run.message = job.message

            if job.status in terminal:
                if job.status == JobStatus.COMPLETED:
                    run.progress = progress_end
                    return
                # FAILED / CANCELLED
                raise RuntimeError(
                    job.error or f"Job {job_id} terminé avec le statut {job.status}"
                )

            await asyncio.sleep(_JOB_POLL_INTERVAL)
