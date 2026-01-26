"""YouTube/Twitch download service using yt-dlp with parallel download support."""

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

# Semaphore for parallel download limiting
_download_semaphore: Optional[asyncio.Semaphore] = None


def get_download_semaphore() -> asyncio.Semaphore:
    """Get or create the download semaphore for parallel limiting."""
    global _download_semaphore
    if _download_semaphore is None:
        max_parallel = getattr(settings, 'MAX_PARALLEL_DOWNLOADS', 4)
        _download_semaphore = asyncio.Semaphore(max_parallel)
        logger.info("Download semaphore initialized with %d slots", max_parallel)
    return _download_semaphore


@dataclass
class VideoInfo:
    """Information about a video from YouTube/Twitch."""
    
    id: str
    title: str
    description: str
    duration: float  # seconds
    thumbnail_url: Optional[str]
    channel: str
    channel_id: str
    upload_date: str  # YYYYMMDD
    view_count: int
    url: str
    platform: str  # "youtube", "twitch"
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "duration": self.duration,
            "thumbnailUrl": self.thumbnail_url,
            "channel": self.channel,
            "channelId": self.channel_id,
            "uploadDate": self.upload_date,
            "viewCount": self.view_count,
            "url": self.url,
            "platform": self.platform,
        }


class YouTubeDLService:
    """Service for downloading videos from YouTube and Twitch using yt-dlp."""
    
    _instance: Optional["YouTubeDLService"] = None
    
    def __init__(self):
        self.downloads_dir = settings.LIBRARY_PATH / "downloads"
        self.downloads_dir.mkdir(parents=True, exist_ok=True)
        self._yt_dlp_path = self._find_yt_dlp()
    
    @classmethod
    def get_instance(cls) -> "YouTubeDLService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def _find_yt_dlp(self) -> str:
        """Find yt-dlp executable."""
        # Try in venv
        venv_path = Path(__file__).parent.parent.parent.parent / ".venv" / "Scripts" / "yt-dlp.exe"
        if venv_path.exists():
            return str(venv_path)
        
        # Try system PATH
        return "yt-dlp"
    
    @staticmethod
    def detect_platform(url: str) -> Optional[str]:
        """Detect platform from URL."""
        url_lower = url.lower()
        
        if "youtube.com" in url_lower or "youtu.be" in url_lower:
            return "youtube"
        elif "twitch.tv" in url_lower:
            return "twitch"
        
        return None
    
    @staticmethod
    def is_valid_url(url: str) -> bool:
        """Check if URL is a valid YouTube or Twitch URL."""
        patterns = [
            r"(youtube\.com/watch\?v=[\w-]+)",
            r"(youtu\.be/[\w-]+)",
            r"(youtube\.com/shorts/[\w-]+)",
            r"(twitch\.tv/videos/\d+)",
            r"(clips\.twitch\.tv/[\w-]+)",
            r"(twitch\.tv/[\w]+/clip/[\w-]+)",
        ]
        
        for pattern in patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False
    
    async def get_video_info(self, url: str) -> Optional[VideoInfo]:
        """Get video information without downloading."""
        platform = self.detect_platform(url)
        if not platform:
            logger.error("Unknown platform for URL: %s", url)
            return None
        
        cmd = [
            self._yt_dlp_path,
            "--dump-json",
            "--no-download",
            "--no-warnings",
            url
        ]
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            if proc.returncode != 0:
                logger.error("yt-dlp info failed: %s", stderr.decode(errors='replace')[:500])
                return None
            
            # Decode with error handling for special characters
            data = json.loads(stdout.decode(errors='replace'))
            
            return VideoInfo(
                id=data.get("id", ""),
                title=data.get("title", "Sans titre"),
                description=data.get("description", "")[:500] if data.get("description") else "",
                duration=float(data.get("duration", 0)),
                thumbnail_url=data.get("thumbnail"),
                channel=data.get("uploader", data.get("channel", "")),
                channel_id=data.get("uploader_id", data.get("channel_id", "")),
                upload_date=data.get("upload_date", ""),
                view_count=int(data.get("view_count", 0)),
                url=url,
                platform=platform,
            )
            
        except json.JSONDecodeError as e:
            logger.error("Failed to parse yt-dlp output: %s", e)
            return None
        except Exception as e:
            logger.exception("Error getting video info: %s", e)
            return None
    
    async def download_video(
        self,
        url: str,
        output_dir: Optional[Path] = None,
        quality: str = "best",
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Optional[Path]:
        """Download video from URL.
        
        Args:
            url: YouTube or Twitch URL
            output_dir: Directory to save video (default: downloads_dir)
            quality: Video quality - "best", "1080", "720", "480"
            progress_callback: Callback with (progress_percent, status_message)
            
        Returns:
            Path to downloaded file, or None on failure
        """
        output_dir = output_dir or self.downloads_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Build quality format
        format_spec = self._build_format(quality)
        
        # Output template - use simple filename to avoid special character issues
        output_template = str(output_dir / "video_%(id)s.%(ext)s")
        
        cmd = [
            self._yt_dlp_path,
            "-f", format_spec,
            "-o", output_template,
            "--no-warnings",
            "--newline",  # Progress on new lines
            "--progress-template", "%(progress._percent_str)s",
            url
        ]
        
        logger.info("Starting download: %s", url)
        if progress_callback:
            progress_callback(0, "Démarrage du téléchargement...")
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Read progress from stdout
            downloaded_file = None
            
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                
                # Decode with error handling for special characters
                line_str = line.decode(errors='replace').strip()
                
                # Parse progress percentage
                if "%" in line_str:
                    try:
                        pct = float(line_str.replace("%", "").strip())
                        if progress_callback:
                            progress_callback(pct, f"Téléchargement: {pct:.0f}%")
                    except ValueError:
                        pass
                
                # Try to find destination file
                if "[download] Destination:" in line_str:
                    downloaded_file = line_str.split("Destination:")[-1].strip()
                elif "has already been downloaded" in line_str:
                    # Already downloaded - extract path
                    match = re.search(r"\[download\] (.+?) has already", line_str)
                    if match:
                        downloaded_file = match.group(1)
            
            await proc.wait()
            
            if proc.returncode != 0:
                stderr = await proc.stderr.read()
                logger.error("Download failed: %s", stderr.decode(errors='replace')[:500])
                if progress_callback:
                    progress_callback(0, "Échec du téléchargement")
                return None
            
            # Find the downloaded file if not captured
            if not downloaded_file or not os.path.exists(downloaded_file):
                # List video files in output directory sorted by modification time
                video_extensions = ['.mp4', '.mkv', '.webm', '.mov', '.avi']
                files = []
                for ext in video_extensions:
                    files.extend(output_dir.glob(f"*{ext}"))
                
                if files:
                    # Sort by modification time, most recent first
                    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                    downloaded_file = str(files[0])
                    logger.info("Found downloaded file by scan: %s", downloaded_file)
            
            if downloaded_file:
                downloaded_path = Path(downloaded_file)
                if downloaded_path.exists():
                    logger.info("Download complete: %s", downloaded_file)
                    if progress_callback:
                        progress_callback(100, "Téléchargement terminé")
                    return downloaded_path
            
            logger.error("Could not find downloaded file in %s", output_dir)
            return None
            
        except Exception as e:
            logger.exception("Download error: %s", e)
            if progress_callback:
                progress_callback(0, f"Erreur: {e}")
            return None
    
    def _build_format(self, quality: str) -> str:
        """Build yt-dlp format string."""
        if quality == "best":
            return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        elif quality == "1080":
            return "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
        elif quality == "720":
            return "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"
        elif quality == "480":
            return "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best"
        else:
            return "best"
    
    async def download_thumbnail(self, url: str, output_path: Path) -> bool:
        """Download video thumbnail."""
        info = await self.get_video_info(url)
        if not info or not info.thumbnail_url:
            return False
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(info.thumbnail_url) as resp:
                    if resp.status == 200:
                        content = await resp.read()
                        output_path.write_bytes(content)
                        return True
        except Exception as e:
            logger.error("Failed to download thumbnail: %s", e)
        
        return False
    
    async def download_video_with_semaphore(
        self,
        url: str,
        output_dir: Optional[Path] = None,
        quality: str = "best",
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Optional[Path]:
        """Download video with semaphore limiting for parallel downloads.
        
        Uses the global semaphore to limit concurrent downloads.
        """
        semaphore = get_download_semaphore()
        async with semaphore:
            logger.info("Acquired download slot for: %s", url[:50])
            return await self.download_video(url, output_dir, quality, progress_callback)
    
    async def download_batch(
        self,
        urls: List[str],
        output_dir: Optional[Path] = None,
        quality: str = "best",
        progress_callback: Optional[Callable[[int, float, str], None]] = None
    ) -> Dict[str, Optional[Path]]:
        """Download multiple videos in parallel.
        
        Args:
            urls: List of video URLs to download
            output_dir: Directory to save videos
            quality: Video quality
            progress_callback: Callback with (url_index, progress_percent, status_message)
            
        Returns:
            Dict mapping URL to downloaded file path (or None on failure)
        """
        results: Dict[str, Optional[Path]] = {}
        total = len(urls)
        completed = [0]  # Use list for mutation in closure
        
        async def download_one(index: int, url: str):
            def local_progress(pct: float, msg: str):
                if progress_callback:
                    progress_callback(index, pct, msg)
            
            try:
                path = await self.download_video_with_semaphore(
                    url, output_dir, quality, local_progress
                )
                results[url] = path
                completed[0] += 1
                logger.info("Batch progress: %d/%d completed", completed[0], total)
            except Exception as e:
                logger.error("Failed to download %s: %s", url, e)
                results[url] = None
        
        # Start all downloads concurrently
        tasks = [
            asyncio.create_task(download_one(i, url))
            for i, url in enumerate(urls)
        ]
        
        await asyncio.gather(*tasks, return_exceptions=True)
        
        success_count = sum(1 for v in results.values() if v is not None)
        logger.info("Batch download complete: %d/%d succeeded", success_count, total)
        
        return results
    
    async def get_channel_videos(
        self,
        channel_url: str,
        limit: int = 10
    ) -> list[VideoInfo]:
        """Get recent videos from a channel."""
        cmd = [
            self._yt_dlp_path,
            "--dump-json",
            "--no-download",
            "--no-warnings",
            "--flat-playlist",
            "--playlist-items", f"1:{limit}",
            channel_url
        ]
        
        videos = []
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            if proc.returncode != 0:
                logger.error("Failed to get channel videos: %s", stderr.decode(errors='replace')[:500])
                return []
            
            # Each line is a JSON object - decode with error handling
            for line in stdout.decode(errors='replace').strip().split("\n"):
                if line:
                    try:
                        data = json.loads(line)
                        platform = self.detect_platform(channel_url) or "unknown"
                        
                        videos.append(VideoInfo(
                            id=data.get("id", ""),
                            title=data.get("title", "Sans titre"),
                            description="",
                            duration=float(data.get("duration", 0)) if data.get("duration") else 0,
                            thumbnail_url=data.get("thumbnail"),
                            channel=data.get("uploader", data.get("channel", "")),
                            channel_id=data.get("uploader_id", data.get("channel_id", "")),
                            upload_date=data.get("upload_date", ""),
                            view_count=int(data.get("view_count", 0)) if data.get("view_count") else 0,
                            url=data.get("url", data.get("webpage_url", "")),
                            platform=platform,
                        ))
                    except json.JSONDecodeError:
                        continue
            
            return videos
            
        except Exception as e:
            logger.exception("Error getting channel videos: %s", e)
            return []

