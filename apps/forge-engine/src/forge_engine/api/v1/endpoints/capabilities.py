"""System capabilities endpoint."""

import os
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from forge_engine.core.config import settings
from forge_engine.services.ffmpeg import FFmpegService
from forge_engine.services.gpu_manager import GPUManager
from forge_engine.services.transcription import TranscriptionService
from forge_engine.services.transcription_provider import (
    ProviderType,
    TranscriptionProviderManager,
)

router = APIRouter()


def recommend_whisper_model() -> str:
    """Recommend Whisper model based on available GPU VRAM."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            vram_mb = int(result.stdout.strip().split("\n")[0])
            if vram_mb >= 10_000:
                return "large-v3"
            elif vram_mb >= 6_000:
                return "medium"
            elif vram_mb >= 3_000:
                return "small"
        return "base"  # CPU fallback
    except Exception:
        return "small"


class ProviderSettingRequest(BaseModel):
    """Request to change transcription provider."""
    provider: str  # "local", "openai", "deepgram"


@router.get("/capabilities")
async def get_capabilities() -> dict:
    """Get system capabilities."""
    ffmpeg = FFmpegService()
    transcription = TranscriptionService()

    # Check FFmpeg
    ffmpeg_available = await ffmpeg.check_availability()
    ffmpeg_info = {
        "version": ffmpeg.version or "unknown",
        "hasNvenc": ffmpeg.has_nvenc,
        "hasLibass": ffmpeg.has_libass,
        "encoders": ffmpeg.available_encoders,
    } if ffmpeg_available else {
        "version": "not found",
        "hasNvenc": False,
        "hasLibass": False,
        "encoders": [],
    }

    # Check Whisper - get actual device info via ctranslate2 (what faster-whisper actually uses)
    whisper_device = "cpu"
    whisper_compute_type = "float32"
    cuda_available = False

    try:
        import ctranslate2
        cuda_count = ctranslate2.get_cuda_device_count()
        if cuda_count > 0:
            cuda_available = True
            whisper_device = "cuda"
            whisper_compute_type = settings.WHISPER_COMPUTE_TYPE
    except (ImportError, Exception):
        pass

    # Fallback to torch if available
    if not cuda_available:
        try:
            import torch
            if torch.cuda.is_available():
                whisper_device = "cuda"
                whisper_compute_type = settings.WHISPER_COMPUTE_TYPE
        except ImportError:
            pass

    # Check if model is loaded (singleton check)
    model_loaded = False
    try:
        singleton_transcription = TranscriptionService.get_instance() if hasattr(TranscriptionService, 'get_instance') else transcription
        model_loaded = singleton_transcription._model is not None if hasattr(singleton_transcription, '_model') else False
    except Exception:
        pass

    whisper_info = {
        "available": transcription.is_available(),
        "models": ["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
        "currentModel": settings.WHISPER_MODEL,
        "device": whisper_device,
        "computeType": whisper_compute_type,
        "modelLoaded": model_loaded,
    }

    # Check GPU via GPUManager (supports multi-GPU)
    gpu_manager = GPUManager.get_instance()
    await gpu_manager.initialize()
    gpu_status = await gpu_manager.get_status()

    gpu_info = {
        "available": gpu_status["has_cuda"],
        "count": gpu_status["gpu_count"],
        "totalVramGb": gpu_status["total_vram_gb"],
        "freeVramGb": gpu_status["free_vram_gb"],
        "gpus": gpu_status["gpus"],
    }

    # Storage info
    library_path = Path(settings.LIBRARY_PATH)
    try:
        usage = shutil.disk_usage(library_path)
        storage_info = {
            "libraryPath": str(library_path),
            "freeSpace": usage.free,
        }
    except Exception:
        storage_info = {
            "libraryPath": str(library_path),
            "freeSpace": 0,
        }

    # Check transcription providers
    try:
        provider_manager = TranscriptionProviderManager.get_instance()
        providers_info = provider_manager.get_status()
    except Exception:
        providers_info = {
            "available_providers": ["local"],
            "default_provider": "local",
            "providers": {}
        }

    return {
        "ffmpeg": ffmpeg_info,
        "whisper": whisper_info,
        "gpu": gpu_info,
        "storage": storage_info,
        "transcription": providers_info,
    }


@router.get("/whisper-recommendation")
async def get_whisper_recommendation():
    """Return the recommended Whisper model for this machine."""
    model = recommend_whisper_model()
    has_gpu = False
    vram_mb = 0
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            vram_mb = int(result.stdout.strip().split("\n")[0])
            has_gpu = True
    except Exception:
        pass
    return {
        "recommended_model": model,
        "has_gpu": has_gpu,
        "vram_mb": vram_mb,
        "cpu_warning": not has_gpu,
    }


@router.get("/transcription/providers")
async def get_transcription_providers() -> dict:
    """Get available transcription providers and current setting."""
    try:
        manager = TranscriptionProviderManager.get_instance()
        status = manager.get_status()

        # Add API key status (without revealing keys)
        openai_configured = bool(os.environ.get("OPENAI_API_KEY"))
        deepgram_configured = bool(os.environ.get("DEEPGRAM_API_KEY"))

        return {
            "success": True,
            "current": status["default_provider"],
            "available": status["available_providers"],
            "providers": {
                "local": {
                    "name": "GPU Local",
                    "description": "RTX 4070 Ti - Gratuit, ~25min pour 3h",
                    "available": "local" in status["available_providers"],
                    "cost_per_hour": 0,
                    "icon": "gpu",
                },
                "openai": {
                    "name": "OpenAI Whisper",
                    "description": "API Cloud - $0.36/h, ~5min pour 3h",
                    "available": openai_configured and "openai" in status["available_providers"],
                    "configured": openai_configured,
                    "cost_per_hour": 0.36,
                    "icon": "cloud",
                },
                "deepgram": {
                    "name": "Deepgram Nova-2",
                    "description": "API Cloud - $0.26/h, ~3min pour 3h",
                    "available": deepgram_configured and "deepgram" in status["available_providers"],
                    "configured": deepgram_configured,
                    "cost_per_hour": 0.26,
                    "icon": "bolt",
                },
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "current": "local",
            "available": ["local"],
            "providers": {}
        }


@router.get("/platforms")
async def get_platform_presets() -> dict:
    """Return export platform presets."""
    return {"platforms": settings.PLATFORM_PRESETS}


@router.post("/transcription/provider")
async def set_transcription_provider(request: ProviderSettingRequest) -> dict:
    """Set the default transcription provider."""
    try:
        manager = TranscriptionProviderManager.get_instance()

        # Map string to enum
        provider_map = {
            "local": ProviderType.LOCAL,
            "openai": ProviderType.OPENAI,
            "deepgram": ProviderType.DEEPGRAM,
        }

        if request.provider not in provider_map:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid provider: {request.provider}. Must be one of: local, openai, deepgram"
            )

        provider_type = provider_map[request.provider]

        # Check if provider is available
        if provider_type not in manager.available_providers:
            if provider_type == ProviderType.OPENAI:
                raise HTTPException(
                    status_code=400,
                    detail="OpenAI provider not available. Set OPENAI_API_KEY environment variable."
                )
            elif provider_type == ProviderType.DEEPGRAM:
                raise HTTPException(
                    status_code=400,
                    detail="Deepgram provider not available. Set DEEPGRAM_API_KEY environment variable."
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Provider {request.provider} is not available."
                )

        manager.default_provider = provider_type

        return {
            "success": True,
            "provider": request.provider,
            "message": f"Transcription provider set to {request.provider}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
