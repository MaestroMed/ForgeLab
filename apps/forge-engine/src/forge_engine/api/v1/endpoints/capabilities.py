"""System capabilities endpoint."""

import logging
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

logger = logging.getLogger(__name__)

router = APIRouter()


def recommend_whisper_model() -> str:
    """Recommend Whisper model based on available GPU VRAM.

    Benchmark-based tiers:
    - ≥16 GB VRAM: large-v3 (best quality)
    - 10-16 GB (RTX 4070 Ti 12GB): medium — large-v3 + batch=16 thrashes
      VRAM on 12GB; medium with the hotwords dictionary gives near-large-v3
      quality at 3-4× the speed
    - 6-10 GB: medium (reduced batch)
    - 3-6 GB: small
    - CPU: base
    """
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            vram_mb = int(result.stdout.strip().split("\n")[0])
            if vram_mb >= 16_000:
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
    except (ImportError, Exception) as e:
        logger.debug("ctranslate2 CUDA probe failed, falling back: %s", e)

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


@router.get("/health")
async def get_full_health() -> dict:
    """Complete system health check.

    Returns per-subsystem status (ffmpeg/gpu/whisper/ollama/disk/system/library)
    plus an overall_status aggregate. Designed to be resilient: any individual
    probe failure is reported as a 'warning' or 'error' on that subsystem
    rather than raising.
    """
    import time

    checks: dict = {}
    overall_status = "ok"

    def _bump(level: str) -> None:
        nonlocal overall_status
        if level == "error":
            overall_status = "error"
        elif level == "warning" and overall_status == "ok":
            overall_status = "warning"

    # FFmpeg
    try:
        result = subprocess.run(
            [settings.FFMPEG_PATH, "-version"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            first_line = result.stdout.splitlines()[0] if result.stdout else ""
            # Check NVENC support via encoder listing
            try:
                result2 = subprocess.run(
                    [settings.FFMPEG_PATH, "-hide_banner", "-encoders"],
                    capture_output=True, text=True, timeout=5
                )
                has_nvenc = "nvenc" in (result2.stdout or "")
            except Exception:
                has_nvenc = False
            checks["ffmpeg"] = {
                "status": "ok",
                "version": first_line[:100],
                "nvenc": has_nvenc,
            }
        else:
            checks["ffmpeg"] = {"status": "error", "message": "FFmpeg command failed"}
            _bump("error")
    except Exception as e:
        checks["ffmpeg"] = {"status": "error", "message": f"FFmpeg not found: {e}"}
        _bump("error")

    # GPU (nvidia-smi probe; non-NVIDIA GPUs are treated as a warning, not error)
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            first = result.stdout.strip().splitlines()[0]
            parts = [p.strip() for p in first.split(",")]
            if len(parts) >= 4:
                try:
                    checks["gpu"] = {
                        "status": "ok",
                        "name": parts[0],
                        "vram_total_mb": int(parts[1]),
                        "vram_used_mb": int(parts[2]),
                        "driver": parts[3],
                    }
                except ValueError:
                    checks["gpu"] = {"status": "warning", "message": "GPU output parse error"}
            else:
                checks["gpu"] = {"status": "warning", "message": "Unexpected nvidia-smi output"}
        else:
            checks["gpu"] = {"status": "warning", "message": "No NVIDIA GPU detected (CPU fallback)"}
    except Exception as e:
        checks["gpu"] = {"status": "warning", "message": f"GPU detection failed: {e}"}

    # Whisper
    try:
        # Import guard — if faster-whisper/ctranslate2 aren't importable this fails.
        from forge_engine.services.transcription import TranscriptionService  # noqa: F401
        checks["whisper"] = {
            "status": "ok",
            "model": settings.WHISPER_MODEL,
            "device": settings.WHISPER_DEVICE,
        }
    except Exception as e:
        checks["whisper"] = {"status": "error", "message": str(e)}
        _bump("error")

    # Ollama (LLM — not running = warning, content generation disabled)
    try:
        from forge_engine.services.llm_local import LocalLLMService
        llm = LocalLLMService.get_instance()
        available = await llm.check_availability()
        checks["ollama"] = {
            "status": "ok" if available else "warning",
            "model": llm._current_model if available else None,
            "message": "" if available else "Ollama not running (content generation disabled)",
        }
        if not available:
            _bump("warning")
    except Exception as e:
        checks["ollama"] = {"status": "warning", "message": str(e)}
        _bump("warning")

    # Disk space on LIBRARY_PATH
    try:
        usage = shutil.disk_usage(str(settings.LIBRARY_PATH))
        free_gb = usage.free / (1024 ** 3)
        total_gb = usage.total / (1024 ** 3)
        disk_status = "ok" if free_gb > 10 else "warning" if free_gb > 2 else "error"
        checks["disk"] = {
            "status": disk_status,
            "free_gb": round(free_gb, 1),
            "total_gb": round(total_gb, 1),
            "library_path": str(settings.LIBRARY_PATH),
        }
        _bump(disk_status)
    except Exception as e:
        checks["disk"] = {"status": "error", "message": str(e)}
        _bump("error")

    # System (RAM / CPU) — psutil may not be installed, skip gracefully
    try:
        import psutil  # type: ignore
        vm = psutil.virtual_memory()
        checks["system"] = {
            "status": "ok",
            "cpu_count": psutil.cpu_count(logical=True),
            "ram_total_gb": round(vm.total / (1024 ** 3), 1),
            "ram_used_percent": vm.percent,
        }
    except ImportError:
        checks["system"] = {
            "status": "warning",
            "message": "psutil not installed (system metrics unavailable)",
        }
    except Exception as e:
        checks["system"] = {"status": "warning", "message": str(e)}

    # Library path sanity
    try:
        if Path(settings.LIBRARY_PATH).exists():
            checks["library"] = {"status": "ok", "path": str(settings.LIBRARY_PATH)}
        else:
            checks["library"] = {"status": "error", "path": str(settings.LIBRARY_PATH)}
            _bump("error")
    except Exception as e:
        checks["library"] = {"status": "error", "message": str(e)}
        _bump("error")

    return {
        "overall_status": overall_status,
        "checks": checks,
        "timestamp": time.time(),
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
