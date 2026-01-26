"""Export service for generating complete export packs."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from forge_engine.core.config import settings
from forge_engine.core.database import async_session_maker
from forge_engine.core.jobs import Job, JobManager
from forge_engine.models import Project, Segment, Artifact, Template
from forge_engine.services.render import RenderService
from forge_engine.services.captions import CaptionEngine
from forge_engine.services.intro import IntroEngine

logger = logging.getLogger(__name__)


class ExportService:
    """Service for exporting clips and generating export packs."""
    
    def __init__(self):
        self.render = RenderService()
        self.captions = CaptionEngine()
        self.intro = IntroEngine()
    
    async def run_export(
        self,
        job: Job,
        project_id: str,
        segment_id: str,
        variant: str = "A",
        template_id: Optional[str] = None,
        platform: str = "tiktok",
        include_captions: bool = True,
        burn_subtitles: bool = True,
        include_cover: bool = True,
        include_metadata: bool = True,
        include_post: bool = True,
        use_nvenc: bool = True,
        caption_style: Optional[Dict[str, Any]] = None,
        layout_config: Optional[Dict[str, Any]] = None,
        intro_config: Optional[Dict[str, Any]] = None,
        music_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run the export pipeline."""
        job_manager = JobManager.get_instance()
        
        async with async_session_maker() as db:
            # Get project and segment
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            
            if not project:
                raise ValueError(f"Project not found: {project_id}")
            
            result = await db.execute(select(Segment).where(Segment.id == segment_id))
            segment = result.scalar_one_or_none()
            
            if not segment:
                raise ValueError(f"Segment not found: {segment_id}")
            
            # Get template if specified
            template = None
            if template_id:
                result = await db.execute(select(Template).where(Template.id == template_id))
                template = result.scalar_one_or_none()
            
            # Setup paths
            project_dir = settings.LIBRARY_PATH / "projects" / project_id
            exports_dir = project_dir / "exports" / f"{segment_id}_{variant}"
            exports_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name = f"clip_{variant}_{timestamp}"
            
            artifacts = []
            
            # Load transcript for this segment
            transcript_segments = []
            analysis_dir = project_dir / "analysis"
            transcript_path = analysis_dir / "transcript.json"
            
            if transcript_path.exists():
                with open(transcript_path, "r", encoding="utf-8") as f:
                    transcript_data = json.load(f)
                
                # Filter to segment time range
                all_segments = transcript_data.get("segments", [])
                transcript_segments = [
                    seg for seg in all_segments
                    if segment.start_time <= seg.get("start", 0) <= segment.end_time
                ]
                logger.info(f"Loaded {len(all_segments)} total transcript segments, filtered to {len(transcript_segments)} for clip range {segment.start_time}-{segment.end_time}")
            
            job_manager.update_progress(job, 5, "setup", "Preparing export...")
            
            # Get actual video dimensions from project metadata or probe
            video_width = project.width or 1920
            video_height = project.height or 1080
            logger.info(f"Source video dimensions: {video_width}x{video_height}")
            
            # Build layout config - use edited zones from frontend if provided
            if layout_config and layout_config.get("facecam") and layout_config.get("content"):
                # Use frontend-edited zones with sourceCrop
                fc = layout_config["facecam"]
                cc = layout_config["content"]
                
                # Convert sourceCrop (0-1 normalized) to pixel values based on ACTUAL video size
                facecam_source = fc.get("sourceCrop", {"x": 0, "y": 0, "width": 1, "height": 1})
                content_source = cc.get("sourceCrop", {"x": 0, "y": 0, "width": 1, "height": 1})
                
                # Ensure crop values are within bounds
                def clamp_crop(crop, max_w, max_h):
                    x = max(0, min(crop["x"], 0.99))
                    y = max(0, min(crop["y"], 0.99))
                    w = max(0.01, min(crop["width"], 1 - x))
                    h = max(0.01, min(crop["height"], 1 - y))
                    return {
                        "x": int(x * max_w),
                        "y": int(y * max_h),
                        "width": max(2, int(w * max_w)),  # FFmpeg requires even dimensions
                        "height": max(2, int(h * max_h)),
                    }
                
                render_layout_config = {
                    "facecam_rect": clamp_crop(facecam_source, video_width, video_height),
                    "content_rect": clamp_crop(content_source, video_width, video_height),
                    "facecam_ratio": layout_config.get("facecamRatio", 0.4),
                    "background_blur": True,
                }
                logger.info(f"Layout config: facecam={render_layout_config['facecam_rect']}, content={render_layout_config['content_rect']}")
            else:
                # Fallback to segment's detected zones
                render_layout_config = {
                    "facecam_rect": segment.facecam_rect,
                    "content_rect": segment.content_rect,
                    "facecam_ratio": 0.4,
                    "background_blur": True,
                }
            
            if template and template.layout:
                render_layout_config.update(template.layout)
            
            # Build caption config from custom style or template
            logger.info(f"=== EXPORT DEBUG ===")
            logger.info(f"[EXPORT] caption_style received: {caption_style}")
            if caption_style:
                logger.info(f"[EXPORT] fontFamily: {caption_style.get('fontFamily')}")
                logger.info(f"[EXPORT] color: {caption_style.get('color')}")
                logger.info(f"[EXPORT] highlightColor: {caption_style.get('highlightColor')}")
                logger.info(f"[EXPORT] animation: {caption_style.get('animation')}")
            logger.info(f"====================")
            logger.info(f"[EXPORT] layout_config received: {layout_config}")
            
            caption_config = {
                "style": "custom" if caption_style else "forge_minimal",
                "word_level": True,
                "max_words_per_line": caption_style.get("wordsPerLine", 6) if caption_style else 6,
                "max_lines": 2,
            }
            
            # If custom style provided, add it to caption config
            if caption_style:
                caption_config["custom_style"] = {
                    "font_family": caption_style.get("fontFamily", "Inter"),
                    "font_size": caption_style.get("fontSize", 48),
                    "font_weight": caption_style.get("fontWeight", 700),
                    "color": caption_style.get("color", "#FFFFFF"),
                    "background_color": caption_style.get("backgroundColor", "transparent"),
                    "outline_color": caption_style.get("outlineColor", "#000000"),
                    "outline_width": caption_style.get("outlineWidth", 2),
                    "position": caption_style.get("position", "bottom"),
                    "position_y": caption_style.get("positionY"),  # Custom Y position
                    "animation": caption_style.get("animation", "none"),
                    "highlight_color": caption_style.get("highlightColor", "#FFD700"),
                }
            elif template and template.caption_style:
                caption_config.update(template.caption_style)
            
            # Render video
            job_manager.update_progress(job, 10, "render", "Rendering video...")
            
            video_path = exports_dir / f"{base_name}.mp4"
            
            # If intro is enabled, we'll apply overlay after rendering
            needs_intro = intro_config and intro_config.get("enabled")
            if needs_intro:
                temp_clip_path = exports_dir / f"{base_name}_no_intro.mp4"
                render_output = temp_clip_path
            else:
                render_output = video_path
            
            render_result = await self.render.render_clip(
                source_path=project.source_path,
                output_path=str(render_output),
                start_time=segment.start_time,
                duration=segment.duration,
                layout_config=render_layout_config,
                caption_config=caption_config if include_captions else None,
                transcript_segments=transcript_segments if include_captions else None,
                use_nvenc=use_nvenc,
                progress_callback=lambda p: job_manager.update_progress(
                    job, 10 + p * 0.5, "render", f"Rendering: {p:.0f}%"
                )
            )
            
            # Apply intro as overlay on the beginning of the clip
            if needs_intro:
                try:
                    job_manager.update_progress(job, 60, "intro", "Applying intro overlay...")
                    
                    # Set title from segment if not provided
                    if not intro_config.get("title"):
                        intro_config["title"] = segment.topic_label or "Untitled"
                    
                    await self.intro.apply_intro_overlay(
                        clip_path=str(temp_clip_path),
                        output_path=str(video_path),
                        config=intro_config,
                        progress_callback=lambda p: job_manager.update_progress(
                            job, 60 + p * 0.1, "intro", f"Intro: {p:.0f}%"
                        )
                    )
                    
                    # Cleanup temp file
                    try:
                        temp_clip_path.unlink()
                    except Exception as e:
                        logger.warning(f"Could not delete temp clip: {e}")
                        
                except Exception as intro_error:
                    # Intro overlay failed - use clip without intro
                    logger.warning(f"Intro overlay failed, exporting without intro: {intro_error}")
                    job_manager.update_progress(job, 70, "fallback", "Intro échouée, export sans intro...")
                    
                    # Rename temp clip to final path
                    import shutil
                    if temp_clip_path.exists():
                        shutil.move(str(temp_clip_path), str(video_path))
            
            # Mix music if configured
            if music_config and music_config.get("path"):
                try:
                    job_manager.update_progress(job, 72, "music", "Mixing music...")
                    music_path = music_config.get("path")
                    music_volume = music_config.get("volume", 0.5)
                    music_offset = music_config.get("startOffset", 0)
                    
                    if Path(music_path).exists():
                        video_with_music_path = exports_dir / f"{base_name}_with_music.mp4"
                        
                        await self._mix_audio_track(
                            video_path=str(video_path),
                            audio_path=music_path,
                            output_path=str(video_with_music_path),
                            audio_volume=music_volume,
                            audio_offset=music_offset,
                        )
                        
                        # Replace original with music version
                        if video_with_music_path.exists():
                            video_path.unlink()
                            video_with_music_path.rename(video_path)
                            logger.info(f"Mixed music into video: {music_path}")
                    else:
                        logger.warning(f"Music file not found: {music_path}")
                except Exception as music_error:
                    logger.warning(f"Music mixing failed, continuing without: {music_error}")
            
            # Record video artifact
            video_artifact = Artifact(
                project_id=project_id,
                segment_id=segment_id,
                variant=variant,
                type="video",
                path=str(video_path),
                filename=video_path.name,
                size=video_path.stat().st_size if video_path.exists() else 0,
                title=segment.topic_label,
            )
            db.add(video_artifact)
            artifacts.append(video_artifact)
            
            # Render cover
            if include_cover:
                job_manager.update_progress(job, 75, "cover", "Generating cover...")
                
                cover_path = exports_dir / f"{base_name}_cover.jpg"
                cover_time = segment.start_time + segment.duration * 0.3  # 30% into clip
                
                await self.render.render_cover(
                    source_path=project.source_path,
                    output_path=str(cover_path),
                    time=cover_time,
                    title_text=segment.topic_label
                )
                
                if cover_path.exists():
                    cover_artifact = Artifact(
                        project_id=project_id,
                        segment_id=segment_id,
                        variant=variant,
                        type="cover",
                        path=str(cover_path),
                        filename=cover_path.name,
                        size=cover_path.stat().st_size,
                    )
                    db.add(cover_artifact)
                    artifacts.append(cover_artifact)
            
            # Generate standalone caption files only if NOT burning subtitles
            # (when burning, subtitles are embedded in video - no need for separate files)
            if include_captions and transcript_segments and not burn_subtitles:
                job_manager.update_progress(job, 80, "captions", "Generating caption files...")
                
                # Adjust times to be relative to clip start
                adjusted_segments = [
                    {
                        **seg,
                        "start": seg["start"] - segment.start_time,
                        "end": seg["end"] - segment.start_time,
                    }
                    for seg in transcript_segments
                ]
                
                caption_paths = self.captions.save_captions(
                    adjusted_segments,
                    exports_dir,
                    base_name
                )
                
                for fmt, path in caption_paths.items():
                    artifact = Artifact(
                        project_id=project_id,
                        segment_id=segment_id,
                        variant=variant,
                        type=f"captions_{fmt}",
                        path=path,
                        filename=Path(path).name,
                        size=Path(path).stat().st_size if Path(path).exists() else 0,
                    )
                    db.add(artifact)
                    artifacts.append(artifact)
            
            # Generate post text
            if include_post:
                job_manager.update_progress(job, 85, "post", "Generating post text...")
                
                post_content = self._generate_post(segment, platform)
                post_path = exports_dir / f"{base_name}_post.txt"
                
                with open(post_path, "w", encoding="utf-8") as f:
                    f.write(post_content)
                
                post_artifact = Artifact(
                    project_id=project_id,
                    segment_id=segment_id,
                    variant=variant,
                    type="post",
                    path=str(post_path),
                    filename=post_path.name,
                    size=post_path.stat().st_size,
                    description=post_content[:500],
                )
                db.add(post_artifact)
                artifacts.append(post_artifact)
            
            # Generate metadata
            if include_metadata:
                job_manager.update_progress(job, 90, "metadata", "Generating metadata...")
                
                metadata = {
                    "project_id": project_id,
                    "segment_id": segment_id,
                    "variant": variant,
                    "platform": platform,
                    "source_file": project.source_filename,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "duration": segment.duration,
                    "score": {
                        "total": segment.score_total,
                        "hook_strength": segment.score_hook,
                        "payoff": segment.score_payoff,
                        "humour_reaction": segment.score_humour,
                        "tension_surprise": segment.score_tension,
                        "clarity_autonomy": segment.score_clarity,
                        "rhythm": segment.score_rhythm,
                        "reasons": segment.score_reasons,
                        "tags": segment.score_tags,
                    },
                    "topic_label": segment.topic_label,
                    "hook_text": segment.hook_text,
                    "layout_type": segment.layout_type,
                    "template_id": template_id,
                    "render_settings": {
                        "width": settings.OUTPUT_WIDTH,
                        "height": settings.OUTPUT_HEIGHT,
                        "fps": settings.OUTPUT_FPS,
                        "use_nvenc": use_nvenc,
                    },
                    "exported_at": datetime.utcnow().isoformat(),
                    "artifacts": [
                        {"type": a.type, "filename": a.filename}
                        for a in artifacts
                    ],
                }
                
                metadata_path = exports_dir / f"{base_name}_metadata.json"
                with open(metadata_path, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
                
                metadata_artifact = Artifact(
                    project_id=project_id,
                    segment_id=segment_id,
                    variant=variant,
                    type="metadata",
                    path=str(metadata_path),
                    filename=metadata_path.name,
                    size=metadata_path.stat().st_size,
                )
                db.add(metadata_artifact)
                artifacts.append(metadata_artifact)
            
            await db.commit()
            
            job_manager.update_progress(job, 100, "complete", "Export complete!")
            
            return {
                "project_id": project_id,
                "segment_id": segment_id,
                "variant": variant,
                "export_dir": str(exports_dir),
                "artifacts": [a.to_dict() for a in artifacts],
            }
    
    async def generate_variants(
        self,
        job: Job,
        project_id: str,
        segment_id: str,
        variants: List[Dict[str, Any]],
        render_proxy: bool = True
    ) -> Dict[str, Any]:
        """Generate multiple variants for a segment."""
        job_manager = JobManager.get_instance()
        
        async with async_session_maker() as db:
            result = await db.execute(select(Segment).where(Segment.id == segment_id))
            segment = result.scalar_one_or_none()
            
            if not segment:
                raise ValueError(f"Segment not found: {segment_id}")
            
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            
            if not project:
                raise ValueError(f"Project not found: {project_id}")
            
            project_dir = settings.LIBRARY_PATH / "projects" / project_id
            renders_dir = project_dir / "renders" / segment_id
            renders_dir.mkdir(parents=True, exist_ok=True)
            
            generated_variants = []
            
            for i, variant_config in enumerate(variants):
                label = variant_config.get("label", chr(65 + i))  # A, B, C
                
                job_manager.update_progress(
                    job,
                    (i / len(variants)) * 100,
                    f"variant_{label}",
                    f"Generating variant {label}..."
                )
                
                if render_proxy:
                    proxy_path = renders_dir / f"variant_{label}_proxy.mp4"
                    
                    layout_config = {
                        "facecam_rect": segment.facecam_rect,
                        "content_rect": segment.content_rect,
                        **(variant_config.get("layout_overrides", {}))
                    }
                    
                    success = await self.render.render_proxy(
                        source_path=project.source_path,
                        output_path=str(proxy_path),
                        start_time=segment.start_time,
                        duration=segment.duration,
                        layout_config=layout_config
                    )
                    
                    generated_variants.append({
                        "label": label,
                        "config": variant_config,
                        "proxy_path": str(proxy_path) if success else None,
                    })
                else:
                    generated_variants.append({
                        "label": label,
                        "config": variant_config,
                        "proxy_path": None,
                    })
            
            # Update segment with variants
            segment.variants = generated_variants
            await db.commit()
            
            job_manager.update_progress(job, 100, "complete", f"Generated {len(variants)} variants")
            
            return {
                "segment_id": segment_id,
                "variants": generated_variants,
            }
    
    def _generate_post(self, segment: "Segment", platform: str) -> str:
        """Generate post text with title, description, and hashtags."""
        title = segment.topic_label or "Check this out!"
        
        # Generate description
        description = segment.hook_text or ""
        if segment.score_reasons:
            description += "\n\n" + " • ".join(segment.score_reasons[:3])
        
        # Generate hashtags based on tags
        base_hashtags = ["viral", "clip", "highlights"]
        
        tag_to_hashtag = {
            "humour": ["funny", "comedy", "lol"],
            "surprise": ["unexpected", "shocking", "wow"],
            "rage": ["angry", "rage", "rant"],
            "clutch": ["clutch", "gaming", "win"],
            "debate": ["debate", "discussion", "hot"],
            "fail": ["fail", "fails", "rip"],
        }
        
        hashtags = base_hashtags.copy()
        for tag in (segment.score_tags or []):
            if tag in tag_to_hashtag:
                hashtags.extend(tag_to_hashtag[tag])
        
        # Platform-specific hashtags
        platform_hashtags = {
            "tiktok": ["fyp", "foryou", "tiktok"],
            "shorts": ["shorts", "youtube", "ytshorts"],
            "reels": ["reels", "instagram", "igreels"],
        }
        
        hashtags.extend(platform_hashtags.get(platform, []))
        
        # Deduplicate and limit
        hashtags = list(dict.fromkeys(hashtags))[:15]
        hashtag_text = " ".join(f"#{tag}" for tag in hashtags)
        
        return f"""📌 {title}

{description}

{hashtag_text}
"""
    
    async def _mix_audio_track(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        audio_volume: float = 0.5,
        audio_offset: float = 0.0,
    ) -> None:
        """Mix an additional audio track (music) with the video's audio.
        
        Args:
            video_path: Path to video file
            audio_path: Path to audio file (MP3, WAV, etc.)
            output_path: Path for output video
            audio_volume: Volume of added audio (0.0-1.0)
            audio_offset: Seconds to skip at start of audio track
        """
        import asyncio
        
        # FFmpeg command to mix audio
        # - adelay to sync if needed
        # - amix to blend the two audio tracks
        # - Keep video stream, add mixed audio
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-ss", str(audio_offset),
            "-i", audio_path,
            "-filter_complex", f"[0:a]volume=1.0[a0];[1:a]volume={audio_volume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",  # Copy video stream without re-encoding
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path,
        ]
        
        logger.info(f"Mixing audio: {' '.join(cmd)}")
        
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            raise RuntimeError(f"Audio mixing failed: {stderr.decode(errors='replace')[:500]}")
    
    async def generate_all_variants(
        self,
        job: Job,
        project_id: str,
        segment_id: str,
        styles: Optional[List[str]] = None,
        platform: str = "tiktok",
        include_captions: bool = True,
        burn_subtitles: bool = True,
        use_nvenc: bool = True,
        layout_config: Optional[Dict[str, Any]] = None,
        intro_config: Optional[Dict[str, Any]] = None,
        music_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate all 3 style variants in one operation.
        
        This exports the same segment with VIRAL, CLEAN, and IMPACT styles,
        allowing the user to quickly compare and choose the best one.
        """
        from forge_engine.services.auto_params import get_auto_params_service
        
        job_manager = JobManager.get_instance()
        
        # Default to all 3 TikTok-optimized styles
        if styles is None:
            styles = ["viral", "clean", "impact"]
        
        results = {
            "success": True,
            "variants": [],
            "errors": []
        }
        
        total_styles = len(styles)
        
        for idx, style_name in enumerate(styles):
            variant_letter = chr(65 + idx)  # A, B, C
            
            try:
                # Update progress
                base_progress = int((idx / total_styles) * 100)
                await job_manager._update_db_progress(
                    job.id,
                    progress=base_progress,
                    message=f"Generating {style_name.upper()} variant ({idx+1}/{total_styles})",
                    stage="multi_export"
                )
                
                # Get auto-computed parameters
                auto_params = get_auto_params_service()
                optimal = await auto_params.compute_optimal_params(
                    layout_info=layout_config
                )
                
                # Create caption style for this variant
                caption_style = {
                    "style_name": style_name,
                    "position": optimal.get("subtitle_position", "bottom"),
                    "positionY": optimal.get("subtitle_position_y"),
                }
                
                # Run export for this variant
                variant_result = await self.run_export(
                    job=job,
                    project_id=project_id,
                    segment_id=segment_id,
                    variant=f"{variant_letter}_{style_name}",
                    platform=platform,
                    include_captions=include_captions,
                    burn_subtitles=burn_subtitles,
                    use_nvenc=use_nvenc,
                    caption_style=caption_style,
                    layout_config=layout_config,
                    intro_config=intro_config,
                    music_config=music_config
                )
                
                results["variants"].append({
                    "style": style_name,
                    "variant": variant_letter,
                    "output_path": variant_result.get("video_path"),
                    "artifacts": variant_result.get("artifacts", [])
                })
                
                logger.info(f"[MultiExport] Generated {style_name} variant successfully")
                
            except Exception as e:
                logger.error(f"[MultiExport] Failed to generate {style_name} variant: {e}")
                results["errors"].append({
                    "style": style_name,
                    "error": str(e)
                })
        
        # Final progress
        await job_manager._update_db_progress(
            job.id,
            progress=100,
            message=f"Generated {len(results['variants'])} variants",
            stage="complete"
        )
        
        results["success"] = len(results["errors"]) == 0
        
        return results
    
    async def batch_export_all(
        self,
        job: Job,
        project_id: str,
        min_score: float = 70.0,
        max_clips: int = 500,
        style: str = "viral_pro",
        platform: str = "tiktok",
        include_captions: bool = True,
        burn_subtitles: bool = True,
        include_cover: bool = True,
        include_metadata: bool = True,
        use_nvenc: bool = True,
    ) -> Dict[str, Any]:
        """
        WORLD CLASS BATCH EXPORT - Export all high-scoring segments in one click.
        
        This is the simplified workflow:
        1. Get all segments with score >= min_score
        2. Take top max_clips segments
        3. Apply viral_pro style by default
        4. Export all clips automatically with covers
        
        Args:
            project_id: Project ID
            min_score: Minimum score threshold (default: 70)
            max_clips: Maximum number of clips to export (default: 20)
            style: Caption style to use (default: viral_pro)
            platform: Target platform (default: tiktok)
        """
        job_manager = JobManager.get_instance()
        
        async with async_session_maker() as db:
            # Get project
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            
            if not project:
                raise ValueError(f"Project not found: {project_id}")
            
            # Get all segments above threshold, sorted by score
            result = await db.execute(
                select(Segment)
                .where(Segment.project_id == project_id)
                .where(Segment.score_total >= min_score)
                .order_by(Segment.score_total.desc())
                .limit(max_clips)
            )
            segments = result.scalars().all()
            
            if not segments:
                job_manager.update_progress(job, 100, "complete", "Aucun segment au-dessus du seuil")
                return {
                    "success": True,
                    "project_id": project_id,
                    "exported_count": 0,
                    "clips": [],
                    "message": f"Aucun segment avec score >= {min_score}"
                }
            
            logger.info(f"[BatchExport] Found {len(segments)} segments to export (score >= {min_score})")
            
            exported_clips = []
            errors = []
            total_segments = len(segments)
            
            # Get the viral_pro caption style
            from forge_engine.services.captions import CAPTION_STYLES
            caption_style_config = CAPTION_STYLES.get(style, CAPTION_STYLES["viral_pro"])
            
            # Convert backend style to frontend format for run_export
            caption_style = {
                "fontFamily": caption_style_config.get("font_family", "Montserrat"),
                "fontSize": caption_style_config.get("font_size", 96),
                "fontWeight": 900 if caption_style_config.get("bold") else 700,
                "color": self._ass_color_to_hex(caption_style_config.get("primary_color", "&H00FFFFFF")),
                "backgroundColor": "transparent",
                "outlineColor": self._ass_color_to_hex(caption_style_config.get("outline_color", "&H00000000")),
                "outlineWidth": caption_style_config.get("outline_width", 5),
                "position": "center" if caption_style_config.get("alignment") == 5 else "bottom",
                "positionY": caption_style_config.get("margin_v", 960),
                "animation": caption_style_config.get("animation", "pop"),
                "highlightColor": self._ass_color_to_hex(caption_style_config.get("highlight_color", "&H0000D7FF")),
                "wordsPerLine": caption_style_config.get("max_words_per_line", 3),
            }
            
            for idx, segment in enumerate(segments):
                try:
                    # Calculate progress
                    base_progress = int((idx / total_segments) * 100)
                    job_manager.update_progress(
                        job,
                        base_progress,
                        f"export_{idx+1}",
                        f"Exporting clip {idx+1}/{total_segments}: {segment.topic_label or 'Untitled'}"
                    )
                    
                    # Create a sub-job for this export (or use same job with progress offset)
                    variant = f"batch_{idx+1:02d}"
                    
                    # Use segment's detected layout if available
                    layout_config = None
                    if segment.facecam_rect and segment.content_rect:
                        layout_config = {
                            "facecam": {
                                "x": 0, "y": 0, "width": 1, "height": 0.4,
                                "sourceCrop": segment.facecam_rect
                            },
                            "content": {
                                "x": 0, "y": 0.4, "width": 1, "height": 0.6,
                                "sourceCrop": segment.content_rect
                            },
                            "facecamRatio": 0.4
                        }
                    
                    # Run export
                    export_result = await self.run_export(
                        job=job,
                        project_id=project_id,
                        segment_id=segment.id,
                        variant=variant,
                        platform=platform,
                        include_captions=include_captions,
                        burn_subtitles=burn_subtitles,
                        include_cover=include_cover,
                        include_metadata=include_metadata,
                        include_post=True,
                        use_nvenc=use_nvenc,
                        caption_style=caption_style,
                        layout_config=layout_config,
                    )
                    
                    exported_clips.append({
                        "segment_id": segment.id,
                        "topic": segment.topic_label,
                        "score": segment.score_total,
                        "duration": segment.duration,
                        "variant": variant,
                        "export_dir": export_result.get("export_dir"),
                        "artifacts": export_result.get("artifacts", []),
                    })
                    
                    logger.info(f"[BatchExport] Exported clip {idx+1}/{total_segments}: {segment.topic_label}")
                    
                except Exception as e:
                    logger.error(f"[BatchExport] Failed to export segment {segment.id}: {e}")
                    errors.append({
                        "segment_id": segment.id,
                        "topic": segment.topic_label,
                        "error": str(e)
                    })
            
            job_manager.update_progress(job, 100, "complete", f"Batch export terminé: {len(exported_clips)} clips")
            
            return {
                "success": len(errors) == 0,
                "project_id": project_id,
                "exported_count": len(exported_clips),
                "total_available": total_segments,
                "clips": exported_clips,
                "errors": errors,
                "style_used": style,
            }
    
    def _ass_color_to_hex(self, ass_color: str) -> str:
        """Convert ASS color (&HAABBGGRR) to hex (#RRGGBB)."""
        if not ass_color or not ass_color.startswith("&H"):
            return "#FFFFFF"
        
        # ASS format: &HAABBGGRR where AA=alpha, BB=blue, GG=green, RR=red
        color = ass_color[2:]  # Remove &H
        if len(color) >= 6:
            # Extract BGR and convert to RGB
            bb = color[-6:-4] if len(color) >= 6 else "FF"
            gg = color[-4:-2] if len(color) >= 4 else "FF"
            rr = color[-2:] if len(color) >= 2 else "FF"
            return f"#{rr}{gg}{bb}"
        
        return "#FFFFFF"









