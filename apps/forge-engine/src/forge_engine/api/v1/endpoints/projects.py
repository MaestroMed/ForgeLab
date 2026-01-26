"""Project endpoints."""

import logging
import os
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from forge_engine.core.database import get_db

logger = logging.getLogger(__name__)
from forge_engine.core.jobs import JobManager, JobType
from forge_engine.models import Project, Segment, Artifact
from forge_engine.services.ingest import IngestService
from forge_engine.services.analysis import AnalysisService
from forge_engine.services.export import ExportService

router = APIRouter()


# Request/Response Models
class CreateProjectRequest(BaseModel):
    name: str
    source_path: str
    profile_id: Optional[str] = None


class IngestRequest(BaseModel):
    create_proxy: bool = True
    extract_audio: bool = True
    audio_track: int = 0
    normalize_audio: bool = True
    auto_analyze: bool = True  # Automatically start analysis after ingest


class AnalyzeRequest(BaseModel):
    transcribe: bool = True
    whisper_model: str = "large-v3"
    language: Optional[str] = None
    detect_scenes: bool = True
    analyze_audio: bool = True
    detect_faces: bool = True
    score_segments: bool = True
    custom_dictionary: Optional[list[str]] = None


class CaptionStyleRequest(BaseModel):
    fontFamily: str = "Inter"
    fontSize: int = 48
    fontWeight: int = 700
    color: str = "#FFFFFF"
    backgroundColor: str = "transparent"
    outlineColor: str = "#000000"
    outlineWidth: int = 2
    position: str = "bottom"  # bottom, center, top
    positionY: Optional[int] = None  # Custom Y position (0-1920, overrides position)
    animation: str = "none"  # none, fade, pop, bounce, glow, wave
    highlightColor: str = "#FFD700"
    wordsPerLine: int = 6


class SourceCropRequest(BaseModel):
    x: float = 0
    y: float = 0
    width: float = 1
    height: float = 1


class LayoutZoneRequest(BaseModel):
    x: float  # % position on 9:16 canvas
    y: float
    width: float
    height: float
    sourceCrop: Optional[SourceCropRequest] = None


class LayoutConfigRequest(BaseModel):
    facecam: Optional[LayoutZoneRequest] = None
    content: Optional[LayoutZoneRequest] = None
    facecamRatio: float = 0.4


class IntroConfigRequest(BaseModel):
    enabled: bool = False
    duration: float = 2.0
    title: str = ""
    badgeText: str = ""
    backgroundBlur: int = 15
    titleFont: str = "Montserrat"
    titleSize: int = 72
    titleColor: str = "#FFFFFF"
    badgeColor: str = "#00FF88"
    animation: str = "fade"  # fade, slide, zoom, bounce


class MusicConfigRequest(BaseModel):
    path: str  # Path to MP3 file
    volume: float = 0.5  # 0.0 to 1.0
    startOffset: float = 0.0  # Seconds to skip at start of music


class ExportRequest(BaseModel):
    segment_id: str
    variant: str = "A"
    template_id: Optional[str] = None
    platform: str = "tiktok"
    include_captions: bool = True
    burn_subtitles: bool = True
    include_cover: bool = False  # Default: only video file
    include_metadata: bool = False  # Default: only video file
    include_post: bool = False  # Default: only video file
    use_nvenc: bool = True
    caption_style: Optional[CaptionStyleRequest] = None
    layout_config: Optional[LayoutConfigRequest] = None
    intro_config: Optional[IntroConfigRequest] = None
    music_config: Optional[MusicConfigRequest] = None


class GenerateVariantsRequest(BaseModel):
    variants: list[dict]
    render_proxy: bool = True


class ApiResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    message: Optional[str] = None


class ImportUrlRequest(BaseModel):
    url: str
    quality: str = "best"  # best, 1080, 720, 480
    auto_ingest: bool = True
    auto_analyze: bool = True


# Endpoints
@router.post("")
async def create_project(
    request: CreateProjectRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a new project."""
    # Validate source path
    if not os.path.exists(request.source_path):
        raise HTTPException(status_code=400, detail="Source file not found")
    
    # Create project
    project = Project(
        name=request.name,
        source_path=request.source_path,
        source_filename=os.path.basename(request.source_path),
        profile_id=request.profile_id,
        status="created",
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return {"success": True, "data": project.to_dict()}


@router.post("/import-url")
async def import_from_url(
    request: ImportUrlRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Import a video from YouTube or Twitch URL."""
    from forge_engine.services.youtube_dl import YouTubeDLService
    
    yt_service = YouTubeDLService.get_instance()
    
    # Validate URL
    if not yt_service.is_valid_url(request.url):
        raise HTTPException(status_code=400, detail="URL non valide (YouTube ou Twitch requis)")
    
    # Get video info first
    info = await yt_service.get_video_info(request.url)
    if not info:
        raise HTTPException(status_code=400, detail="Impossible de récupérer les informations de la vidéo")
    
    # Create project with placeholder
    project = Project(
        name=info.title,
        source_path="",  # Will be updated after download
        source_filename=f"{info.title}.mp4",
        status="downloading",
        project_meta={
            "importUrl": request.url,
            "platform": info.platform,
            "channel": info.channel,
            "uploadDate": info.upload_date,
            "viewCount": info.view_count,
        }
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    # Create download job
    job_manager = JobManager.get_instance()
    
    async def download_handler(job, **kwargs):
        """Handle video download."""
        from forge_engine.api.v1.endpoints.websockets import broadcast_project_update
        from forge_engine.core.config import settings
        from forge_engine.core.database import async_session_maker
        
        project_id = kwargs.get("project_id")
        url = kwargs.get("url")
        quality = kwargs.get("quality", "best")
        auto_ingest = kwargs.get("auto_ingest", True)
        auto_analyze = kwargs.get("auto_analyze", True)
        
        async with async_session_maker() as session:
            result = await session.execute(select(Project).where(Project.id == project_id))
            proj = result.scalar_one_or_none()
            
            if not proj:
                raise ValueError(f"Project not found: {project_id}")
            
            yt = YouTubeDLService.get_instance()
            
            def progress_cb(pct, msg):
                job_manager.update_progress(job, pct * 0.9, "download", msg)
            
            # Download to project directory
            project_dir = settings.LIBRARY_PATH / "projects" / project_id
            project_dir.mkdir(parents=True, exist_ok=True)
            source_dir = project_dir / "source"
            source_dir.mkdir(parents=True, exist_ok=True)
            
            downloaded_path = await yt.download_video(url, source_dir, quality, progress_cb)
            
            if not downloaded_path:
                proj.status = "error"
                proj.error_message = "Échec du téléchargement"
                await session.commit()
                raise ValueError("Download failed")
            
            # Update project
            proj.source_path = str(downloaded_path)
            proj.source_filename = downloaded_path.name
            proj.status = "created"
            await session.commit()
            
            broadcast_project_update({
                "id": proj.id,
                "status": "created",
                "name": proj.name,
                "sourcePath": str(downloaded_path),
            })
            
            job_manager.update_progress(job, 100, "complete", "Téléchargement terminé")
            
            # Auto-chain to ingest if enabled
            if auto_ingest:
                ingest_service = IngestService()
                await job_manager.create_job(
                    job_type=JobType.INGEST,
                    handler=ingest_service.run_ingest,
                    project_id=project_id,
                    auto_analyze=auto_analyze,
                )
            
            return {"downloaded_path": str(downloaded_path)}
    
    # Create job
    job = await job_manager.create_job(
        job_type=JobType.DOWNLOAD,
        handler=download_handler,
        project_id=project.id,
        url=request.url,
        quality=request.quality,
        auto_ingest=request.auto_ingest,
        auto_analyze=request.auto_analyze,
    )
    
    return {
        "success": True,
        "data": {
            "project": project.to_dict(),
            "jobId": job.id,
            "videoInfo": info.to_dict(),
        }
    }


@router.post("/url-info")
async def get_url_info(request: ImportUrlRequest) -> dict:
    """Get video info from URL without downloading."""
    from forge_engine.services.youtube_dl import YouTubeDLService
    
    yt_service = YouTubeDLService.get_instance()
    
    if not yt_service.is_valid_url(request.url):
        raise HTTPException(status_code=400, detail="URL non valide")
    
    info = await yt_service.get_video_info(request.url)
    if not info:
        raise HTTPException(status_code=400, detail="Impossible de récupérer les informations")
    
    return {"success": True, "data": info.to_dict()}


@router.get("")
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """List all projects with segment counts and average scores."""
    query = select(Project)
    
    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))
    if status:
        query = query.where(Project.status == status)
    
    # Count total
    count_query = select(func.count()).select_from(Project)
    if search:
        count_query = count_query.where(Project.name.ilike(f"%{search}%"))
    if status:
        count_query = count_query.where(Project.status == status)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Paginate
    query = query.order_by(Project.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    projects = result.scalars().all()
    
    # Enrich with segment stats
    enriched_items = []
    for p in projects:
        item = p.to_dict()
        
        # Get segment count and average score
        stats_query = select(
            func.count(Segment.id).label("count"),
            func.avg(Segment.score_total).label("avg_score")
        ).where(Segment.project_id == p.id)
        
        stats_result = await db.execute(stats_query)
        stats = stats_result.first()
        
        item["segmentsCount"] = stats.count if stats else 0
        item["averageScore"] = round(stats.avg_score, 1) if stats and stats.avg_score else 0
        
        enriched_items.append(item)
    
    return {
        "success": True,
        "data": {
            "items": enriched_items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "hasMore": (page * page_size) < total,
        }
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a project by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"success": True, "data": project.to_dict()}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Delete a project and all its associated data."""
    import shutil
    from forge_engine.core.config import settings
    
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_name = project.name
    
    # Delete associated segments
    await db.execute(
        Segment.__table__.delete().where(Segment.project_id == project_id)
    )
    
    # Delete associated artifacts
    await db.execute(
        Artifact.__table__.delete().where(Artifact.project_id == project_id)
    )
    
    # Delete the project record
    await db.delete(project)
    await db.commit()
    
    # Delete project folder from disk
    project_dir = settings.LIBRARY_PATH / "projects" / project_id
    if project_dir.exists():
        try:
            shutil.rmtree(project_dir)
            logger.info(f"Deleted project folder: {project_dir}")
        except Exception as e:
            logger.warning(f"Could not delete project folder: {e}")
    
    logger.info(f"Deleted project: {project_name} ({project_id})")
    
    return {"success": True, "message": f"Projet '{project_name}' supprimé"}


@router.post("/{project_id}/ingest")
async def ingest_project(
    project_id: str,
    request: IngestRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Start ingestion for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Create ingest job
    job_manager = JobManager.get_instance()
    ingest_service = IngestService()
    
    job = await job_manager.create_job(
        job_type=JobType.INGEST,
        handler=ingest_service.run_ingest,
        project_id=project_id,
        create_proxy=request.create_proxy,
        extract_audio=request.extract_audio,
        audio_track=request.audio_track,
        normalize_audio=request.normalize_audio,
        auto_analyze=request.auto_analyze,  # Pass to service for chaining
    )
    
    # Update project status
    project.status = "ingesting"
    await db.commit()
    
    return {"success": True, "data": {"jobId": job.id}}


@router.post("/{project_id}/analyze")
async def analyze_project(
    project_id: str,
    request: AnalyzeRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Start analysis for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.status not in ("ingested", "analyzed", "ready"):
        raise HTTPException(status_code=400, detail="Project must be ingested first")
    
    # Create analysis job
    job_manager = JobManager.get_instance()
    analysis_service = AnalysisService()
    
    job = await job_manager.create_job(
        job_type=JobType.ANALYZE,
        handler=analysis_service.run_analysis,
        project_id=project_id,
        transcribe=request.transcribe,
        whisper_model=request.whisper_model,
        language=request.language,
        detect_scenes=request.detect_scenes,
        analyze_audio=request.analyze_audio,
        detect_faces=request.detect_faces,
        score_segments=request.score_segments,
        custom_dictionary=request.custom_dictionary,
    )
    
    # Update project status
    project.status = "analyzing"
    await db.commit()
    
    return {"success": True, "data": {"jobId": job.id}}


@router.get("/{project_id}/timeline")
async def get_timeline(
    project_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get timeline data for a project."""
    from forge_engine.core.config import settings
    import json
    
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Load timeline from analysis cache
    project_dir = settings.LIBRARY_PATH / "projects" / project_id
    timeline_path = project_dir / "analysis" / "timeline.json"
    
    if not timeline_path.exists():
        return {
            "success": True,
            "data": {
                "projectId": project_id,
                "duration": project.duration or 0,
                "layers": [],
                "segments": [],
            }
        }
    
    with open(timeline_path, "r") as f:
        timeline_data = json.load(f)
    
    # Inject layout data if available
    layout_path = project_dir / "analysis" / "layout.json"
    if layout_path.exists():
        try:
            with open(layout_path, "r") as f:
                layout_data = json.load(f)
                timeline_data["faceDetections"] = layout_data.get("face_detections", [])
        except Exception:
            pass
    
    return {"success": True, "data": timeline_data}


@router.get("/{project_id}/segments")
async def list_segments(
    project_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("score", regex="^(score|startTime|duration)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    min_score: Optional[float] = Query(None, ge=0, le=100),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """List segments for a project."""
    query = select(Segment).where(Segment.project_id == project_id)
    
    if min_score is not None:
        query = query.where(Segment.score_total >= min_score)
    
    # Sorting
    sort_column = {
        "score": Segment.score_total,
        "startTime": Segment.start_time,
        "duration": Segment.duration,
    }[sort_by]
    
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    
    # Count
    count_query = select(func.count()).select_from(Segment).where(Segment.project_id == project_id)
    if min_score is not None:
        count_query = count_query.where(Segment.score_total >= min_score)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    segments = result.scalars().all()
    
    return {
        "success": True,
        "data": {
            "items": [s.to_dict() for s in segments],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "hasMore": (page * page_size) < total,
        }
    }


@router.get("/{project_id}/segments/{segment_id}")
async def get_segment(
    project_id: str,
    segment_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a segment by ID."""
    result = await db.execute(
        select(Segment)
        .where(Segment.id == segment_id)
        .where(Segment.project_id == project_id)
    )
    segment = result.scalar_one_or_none()
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    return {"success": True, "data": segment.to_dict()}


@router.post("/{project_id}/segments/{segment_id}/variants")
async def generate_variants(
    project_id: str,
    segment_id: str,
    request: GenerateVariantsRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Generate variants for a segment."""
    result = await db.execute(
        select(Segment)
        .where(Segment.id == segment_id)
        .where(Segment.project_id == project_id)
    )
    segment = result.scalar_one_or_none()
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    # Create variants job
    job_manager = JobManager.get_instance()
    export_service = ExportService()
    
    job = await job_manager.create_job(
        job_type=JobType.GENERATE_VARIANTS,
        handler=export_service.generate_variants,
        project_id=project_id,
        segment_id=segment_id,
        variants=request.variants,
        render_proxy=request.render_proxy,
    )
    
    return {"success": True, "data": {"jobId": job.id}}


@router.post("/{project_id}/export")
async def export_segment(
    project_id: str,
    request: ExportRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Export a segment."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await db.execute(
        select(Segment)
        .where(Segment.id == request.segment_id)
        .where(Segment.project_id == project_id)
    )
    segment = result.scalar_one_or_none()
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    # Create export job
    job_manager = JobManager.get_instance()
    export_service = ExportService()
    
    # Debug log
    logger.info(f"[API] Export request - caption_style: {request.caption_style}")
    logger.info(f"[API] Export request - layout_config: {request.layout_config}")
    logger.info(f"[API] Export request - intro_config: {request.intro_config}")
    logger.info(f"[API] Export request - music_config: {request.music_config}")
    
    job = await job_manager.create_job(
        job_type=JobType.EXPORT,
        handler=export_service.run_export,
        project_id=project_id,
        segment_id=request.segment_id,
        variant=request.variant,
        template_id=request.template_id,
        platform=request.platform,
        include_captions=request.include_captions,
        burn_subtitles=request.burn_subtitles,
        include_cover=request.include_cover,
        include_metadata=request.include_metadata,
        include_post=request.include_post,
        use_nvenc=request.use_nvenc,
        caption_style=request.caption_style.model_dump() if request.caption_style else None,
        layout_config=request.layout_config.model_dump() if request.layout_config else None,
        intro_config=request.intro_config.model_dump() if request.intro_config else None,
        music_config=request.music_config.model_dump() if request.music_config else None,
    )
    
    return {"success": True, "data": {"jobId": job.id}}


class MultiExportRequest(BaseModel):
    """Request body for multi-variant export."""
    segment_id: str
    styles: Optional[List[str]] = None  # Default: ["viral", "clean", "impact"]
    platform: str = "tiktok"
    include_captions: bool = True
    burn_subtitles: bool = True
    use_nvenc: bool = True
    layout_config: Optional[LayoutConfigRequest] = None
    intro_config: Optional[IntroConfigRequest] = None
    music_config: Optional[MusicConfigRequest] = None


@router.post("/{project_id}/export-variants")
async def export_all_variants(
    project_id: str,
    request: MultiExportRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Export a segment with all 3 style variants (VIRAL, CLEAN, IMPACT)."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await db.execute(
        select(Segment)
        .where(Segment.id == request.segment_id)
        .where(Segment.project_id == project_id)
    )
    segment = result.scalar_one_or_none()
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    # Create multi-export job
    job_manager = JobManager.get_instance()
    export_service = ExportService()
    
    logger.info(f"[API] Multi-export request for segment {request.segment_id} with styles: {request.styles or ['viral', 'clean', 'impact']}")
    
    job = await job_manager.create_job(
        job_type=JobType.EXPORT,
        handler=export_service.generate_all_variants,
        project_id=project_id,
        segment_id=request.segment_id,
        styles=request.styles,
        platform=request.platform,
        include_captions=request.include_captions,
        burn_subtitles=request.burn_subtitles,
        use_nvenc=request.use_nvenc,
        layout_config=request.layout_config.model_dump() if request.layout_config else None,
        intro_config=request.intro_config.model_dump() if request.intro_config else None,
        music_config=request.music_config.model_dump() if request.music_config else None,
    )
    
    return {"success": True, "data": {"jobId": job.id, "variants": request.styles or ["viral", "clean", "impact"]}}


class BatchExportRequest(BaseModel):
    """Request body for batch export - WORLD CLASS one-click export."""
    min_score: float = 70.0  # Minimum score threshold
    max_clips: int = 500  # Maximum clips to export (no practical limit)
    style: str = "viral_pro"  # Caption style (default: world class)
    platform: str = "tiktok"
    include_captions: bool = True
    burn_subtitles: bool = True
    include_cover: bool = True
    include_metadata: bool = True
    use_nvenc: bool = True


@router.post("/{project_id}/export-all")
async def batch_export_all_clips(
    project_id: str,
    request: BatchExportRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    WORLD CLASS BATCH EXPORT - Export all high-scoring clips in one click.
    
    This is the simplified workflow for viral content creation:
    1. Analyzes all segments with score >= min_score
    2. Exports top max_clips with viral_pro style
    3. Generates covers and metadata automatically
    
    Returns job ID to track progress via WebSocket.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.status not in ("analyzed", "ready"):
        raise HTTPException(status_code=400, detail="Project must be analyzed first")
    
    # Count available segments
    count_result = await db.execute(
        select(func.count())
        .select_from(Segment)
        .where(Segment.project_id == project_id)
        .where(Segment.score_total >= request.min_score)
    )
    available_count = count_result.scalar() or 0
    
    if available_count == 0:
        return {
            "success": True,
            "data": {
                "message": f"Aucun segment avec score >= {request.min_score}",
                "availableCount": 0
            }
        }
    
    # Create batch export job
    job_manager = JobManager.get_instance()
    export_service = ExportService()
    
    logger.info(f"[API] Batch export for project {project_id}: {available_count} segments available, exporting top {request.max_clips} with style '{request.style}'")
    
    job = await job_manager.create_job(
        job_type=JobType.EXPORT,
        handler=export_service.batch_export_all,
        project_id=project_id,
        min_score=request.min_score,
        max_clips=request.max_clips,
        style=request.style,
        platform=request.platform,
        include_captions=request.include_captions,
        burn_subtitles=request.burn_subtitles,
        include_cover=request.include_cover,
        include_metadata=request.include_metadata,
        use_nvenc=request.use_nvenc,
    )
    
    return {
        "success": True,
        "data": {
            "jobId": job.id,
            "availableCount": available_count,
            "willExport": min(available_count, request.max_clips),
            "style": request.style,
            "minScore": request.min_score
        }
    }


@router.get("/{project_id}/thumbnail")
async def get_project_thumbnail(
    project_id: str,
    time: float = Query(0, description="Time in seconds to extract thumbnail"),
    width: int = Query(320, ge=32, le=1920),
    height: int = Query(180, ge=32, le=1080),
    db: AsyncSession = Depends(get_db)
):
    """Generate a thumbnail from project video at specified time."""
    from fastapi.responses import FileResponse, Response
    from pathlib import Path
    from forge_engine.core.config import settings
    import subprocess
    import hashlib
    
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if project has a stored thumbnail
    if project.thumbnail_path and Path(project.thumbnail_path).exists():
        return FileResponse(
            project.thumbnail_path,
            media_type="image/jpeg"
        )
    
    # Try to find proxy or source video
    project_dir = settings.LIBRARY_PATH / "projects" / project_id
    proxy_path = project_dir / "proxy" / "proxy.mp4"
    source_path = Path(project.source_path) if project.source_path else None
    
    video_path = None
    if proxy_path.exists():
        video_path = proxy_path
    elif source_path and source_path.exists():
        video_path = source_path
    
    if not video_path:
        # Return placeholder
        raise HTTPException(status_code=404, detail="No video found for thumbnail")
    
    # Generate thumbnail using FFmpeg
    cache_dir = project_dir / "cache" / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    # Cache key based on time and size
    cache_key = hashlib.md5(f"{time}_{width}_{height}".encode()).hexdigest()[:8]
    thumb_path = cache_dir / f"thumb_{cache_key}.jpg"
    
    if not thumb_path.exists():
        try:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(max(0, time)),
                "-i", str(video_path),
                "-vframes", "1",
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                "-q:v", "3",
                str(thumb_path)
            ]
            subprocess.run(cmd, capture_output=True, timeout=10)
        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate thumbnail")
    
    if thumb_path.exists():
        return FileResponse(thumb_path, media_type="image/jpeg")
    
    raise HTTPException(status_code=500, detail="Thumbnail generation failed")


@router.get("/{project_id}/artifacts")
async def list_artifacts(
    project_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """List all artifacts for a project."""
    result = await db.execute(
        select(Artifact)
        .where(Artifact.project_id == project_id)
        .order_by(Artifact.created_at.desc())
    )
    artifacts = result.scalars().all()
    
    return {"success": True, "data": [a.to_dict() for a in artifacts]}


@router.get("/{project_id}/artifacts/{artifact_id}/file")
async def serve_artifact_file(
    project_id: str,
    artifact_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Serve an artifact file (video, cover, etc.)."""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse
    from pathlib import Path
    
    result = await db.execute(
        select(Artifact)
        .where(Artifact.id == artifact_id)
        .where(Artifact.project_id == project_id)
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    file_path = Path(artifact.path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Determine media type based on artifact type
    media_types = {
        "video": "video/mp4",
        "cover": "image/jpeg",
        "thumbnail": "image/jpeg",
        "audio": "audio/wav",
    }
    media_type = media_types.get(artifact.type, "application/octet-stream")
    
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=artifact.filename
    )






