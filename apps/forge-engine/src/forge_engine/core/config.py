"""Application configuration."""

import os
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""
    
    # App info
    VERSION: str = "1.0.0"
    APP_NAME: str = "FORGE Engine"
    DEBUG: bool = True  # Dev mode
    
    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8420
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # Paths
    LIBRARY_PATH: Path = Path.home() / "FORGE_LIBRARY"
    DATABASE_PATH: Path = Path.home() / "FORGE_LIBRARY" / "forge.db"
    TEMP_PATH: Path = Path.home() / "FORGE_LIBRARY" / ".temp"
    
    # FFmpeg
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    FORCE_CPU: bool = False
    
    # Performance optimizations
    SKIP_PROXY_IF_NVENC: bool = True  # Skip proxy creation if NVENC available (faster final render)
    USE_HWACCEL: bool = True  # Use GPU hardware acceleration for decode/encode
    FFMPEG_NVENC_PRESET: str = "p4"  # NVENC preset (p1=fastest, p7=best quality)
    FFMPEG_PROXY_PRESET: str = "p1"  # Ultra-fast for proxy
    
    # Whisper TURBO - Auto-optimized based on GPU VRAM
    WHISPER_MODEL: str = "large-v3"  # Best quality (or "distil-large-v3" for speed)
    WHISPER_DEVICE: str = "cuda"  # GPU enabled
    WHISPER_COMPUTE_TYPE: str = "int8_float16"  # INT8 quantization (faster + less VRAM)
    WHISPER_LANGUAGE: str = "fr"  # Default language (FR for streaming content)
    WHISPER_NUM_WORKERS: int = 2  # Default, auto-detected based on VRAM
    WHISPER_BATCH_SIZE: int = 16  # Default, auto-detected based on VRAM
    WHISPER_TURBO_MODE: bool = True  # Enable batched inference for maximum speed
    WHISPER_AUTO_OPTIMIZE: bool = True  # Auto-detect optimal batch_size/workers from VRAM
    
    # Processing
    PROXY_WIDTH: int = 1280
    PROXY_HEIGHT: int = 720
    PROXY_CRF: int = 28
    AUDIO_SAMPLE_RATE: int = 16000
    
    # Job queue
    MAX_CONCURRENT_JOBS: int = 2
    JOB_TIMEOUT: int = 3600  # 1 hour
    
    # Parallel downloads (quick win for 1Gbps connection)
    MAX_PARALLEL_DOWNLOADS: int = 4  # 4-6 simultaneous downloads
    DOWNLOAD_CHUNK_CONNECTIONS: int = 8  # yt-dlp aria2c connections per download
    
    # Output
    OUTPUT_WIDTH: int = 1080
    OUTPUT_HEIGHT: int = 1920
    OUTPUT_FPS: int = 30
    OUTPUT_CRF: int = 23
    
    class Config:
        env_prefix = "FORGE_"
        env_file = ".env"
        case_sensitive = True
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Create directories
        self.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)
        self.TEMP_PATH.mkdir(parents=True, exist_ok=True)
        
        # Update database path if library path changed
        if "LIBRARY_PATH" in kwargs:
            self.DATABASE_PATH = self.LIBRARY_PATH / "forge.db"


# Override paths from environment
if os.environ.get("FORGE_LIBRARY_PATH"):
    _library_path = Path(os.environ["FORGE_LIBRARY_PATH"])
    settings = Settings(
        LIBRARY_PATH=_library_path,
        DATABASE_PATH=_library_path / "forge.db",
        TEMP_PATH=_library_path / ".temp",
    )
else:
    settings = Settings()

# Apply force CPU if specified
if os.environ.get("FORGE_FORCE_CPU"):
    settings.FORCE_CPU = True
    settings.WHISPER_DEVICE = "cpu"
    settings.WHISPER_COMPUTE_TYPE = "float32"









