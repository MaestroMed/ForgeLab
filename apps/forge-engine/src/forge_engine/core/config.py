"""Application configuration."""

import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # App info
    VERSION: str = "1.0.0"
    APP_NAME: str = "FORGE Engine"
    DEBUG: bool = False  # Set FORGE_DEBUG=true in .env for dev mode
    JWT_SECRET: str = "FORGE_JWT_CHANGE_IN_PRODUCTION"
    SAAS_MODE: bool = False  # Enable JWT auth requirement

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8420
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Paths
    LIBRARY_PATH: Path = Path.home() / "FORGE_LIBRARY"
    DATABASE_PATH: Path = Path.home() / "FORGE_LIBRARY" / "forge.db"
    TEMP_PATH: Path = Path.home() / "FORGE_LIBRARY" / ".temp"

    # FFmpeg
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    FORCE_CPU: bool = False

    # Performance optimizations — tuned for Ada Lovelace (RTX 4070+)
    SKIP_PROXY_IF_NVENC: bool = True  # Skip proxy creation if NVENC available (faster final render)
    USE_HWACCEL: bool = True  # Use GPU hardware acceleration for decode/encode
    FFMPEG_NVENC_PRESET: str = "p5"  # p5 = higher quality on Ada (vs p4), still fast
    FFMPEG_PROXY_PRESET: str = "p1"  # Ultra-fast for proxy
    FFMPEG_NVENC_TUNING: str = "hq"  # hq = high quality (vs ll=low latency)
    FFMPEG_NVENC_RC: str = "vbr"  # Variable bitrate for better quality/size
    FFMPEG_NVENC_MULTIPASS: str = "qres"  # Quarter-res first pass (fast, better quality)
    FFMPEG_NVENC_B_REF_MODE: str = "middle"  # B-frames as reference on Ada (+compression)

    # Whisper TURBO - Tuned for 12GB VRAM (RTX 4070 Ti)
    # large-v3 + batch=16 thrashes VRAM on 12GB cards → defaults to medium
    WHISPER_MODEL: str = "medium"  # Best speed/quality balance on 12GB; override via FORGE_WHISPER_MODEL
    WHISPER_DEVICE: str = "cuda"  # GPU enabled
    WHISPER_COMPUTE_TYPE: str = "int8_float16"  # INT8 quantization (faster + less VRAM)
    WHISPER_LANGUAGE: str = "fr"  # Default language (FR for streaming content)
    WHISPER_NUM_WORKERS: int = 2  # Default, auto-detected based on VRAM
    WHISPER_BATCH_SIZE: int = 16  # Safe for medium on 12GB; large-v3 gets auto-reduced to 8
    WHISPER_TURBO_MODE: bool = True  # Enable batched inference for maximum speed
    WHISPER_AUTO_OPTIMIZE: bool = True  # Auto-detect optimal batch_size/workers from VRAM

    # Processing
    PROXY_WIDTH: int = 1280
    PROXY_HEIGHT: int = 720
    PROXY_CRF: int = 28
    AUDIO_SAMPLE_RATE: int = 16000

    # Job queue — 32 threads CPU + 64 GB RAM tolerate more concurrency
    # (but GPU is the bottleneck so we stay conservative on GPU-bound jobs)
    MAX_CONCURRENT_JOBS: int = 3  # Up from 2: allows 1 GPU job + 2 CPU jobs
    BATCH_MAX_WORKERS: int = 3  # Parallel job workers (was 2)
    JOB_TIMEOUT: int = 3600  # 1 hour

    # Parallel downloads — 32 cores can handle way more, network-bound
    MAX_PARALLEL_DOWNLOADS: int = 6  # Up from 4
    DOWNLOAD_CHUNK_CONNECTIONS: int = 16  # aria2c conns per download (was 8)

    # Output
    OUTPUT_WIDTH: int = 1080
    OUTPUT_HEIGHT: int = 1920
    OUTPUT_FPS: int = 30
    OUTPUT_CRF: int = 23

    # Export pipeline
    EXPORT_SINGLE_PASS: bool = True  # Use single-pass FFmpeg pipeline (faster)

    # Platform-specific export presets
    PLATFORM_PRESETS: dict = {
        "tiktok": {
            "width": 1080, "height": 1920, "fps": 30,
            "max_duration": 60, "crf": 23,
            "codec": "libx264", "audio_bitrate": "192k",
            "target_lufs": -14, "max_file_mb": 287,
            "description": "TikTok (max 60s, 287MB)",
        },
        "youtube_shorts": {
            "width": 1080, "height": 1920, "fps": 30,
            "max_duration": 60, "crf": 20,
            "codec": "libx264", "audio_bitrate": "192k",
            "target_lufs": -14, "max_file_mb": 256000,
            "description": "YouTube Shorts (max 60s)",
        },
        "instagram_reels": {
            "width": 1080, "height": 1920, "fps": 30,
            "max_duration": 90, "crf": 23,
            "codec": "libx264", "audio_bitrate": "128k",
            "target_lufs": -16, "max_file_mb": 4096,
            "description": "Instagram Reels (max 90s, 4GB)",
        },
        "twitter": {
            "width": 1080, "height": 1920, "fps": 30,
            "max_duration": 140, "crf": 25,
            "codec": "libx264", "audio_bitrate": "128k",
            "target_lufs": -16, "max_file_mb": 512,
            "description": "Twitter/X (max 140s, 512MB)",
        },
    }

    # Cloud GPU (optional)
    CLOUD_GPU_PROVIDER: str = "local"             # local | runpod | modal | lambda_labs
    CLOUD_GPU_OVERFLOW: bool = False             # Use cloud when local queue > 2 jobs
    CLOUD_RUNPOD_API_KEY: str = ""
    CLOUD_RUNPOD_ENDPOINT_ID: str = ""
    CLOUD_MODAL_TOKEN_ID: str = ""
    CLOUD_MODAL_TOKEN_SECRET: str = ""

    # Local LLM (Ollama)
    # qwen3:8b (5.2GB) chosen over 14b (9.3GB) so it can coexist with Whisper
    # medium (2.5GB) on 12GB VRAM without thrashing. Upgrade to qwen3:14b
    # only when Whisper runs on CPU or large-v3 isn't active.
    LLM_ENABLED: bool = True
    LLM_OLLAMA_URL: str = "http://127.0.0.1:11434"
    LLM_MODEL: str = "qwen3:8b"  # Co-exists with Whisper medium on 12GB VRAM
    LLM_TIMEOUT: int = 120
    LLM_MAX_CONCURRENT: int = 3

    class Config:
        env_prefix = "FORGE_"
        env_file = Path(__file__).parent.parent.parent.parent / ".env"  # apps/forge-engine/.env
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





