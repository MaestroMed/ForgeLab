"""Cloud GPU configuration and cost estimation endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


@router.get("/status")
async def get_cloud_status():
    """Get cloud GPU configuration and availability."""
    from forge_engine.services.cloud_gpu import CloudGPUService
    service = CloudGPUService.get_instance()
    return {
        "cloud_enabled": service.is_cloud_enabled(),
        "provider": service._provider.value,
        "overflow_enabled": __import__("forge_engine.core.config", fromlist=["settings"]).settings.CLOUD_GPU_OVERFLOW,
    }


@router.get("/estimate")
async def estimate_cost(duration_seconds: float = 60.0, provider: str = "local"):
    """Estimate cloud processing cost for a video."""
    from forge_engine.services.cloud_gpu import CloudGPUService, CloudProvider
    service = CloudGPUService.get_instance()
    try:
        p = CloudProvider(provider)
    except ValueError:
        p = CloudProvider.LOCAL
    return service.estimate_cost(duration_seconds, p)


@router.get("/providers")
async def list_providers():
    """List available cloud GPU providers with pricing."""
    from forge_engine.services.cloud_gpu import PROVIDER_COSTS, CloudProvider
    return {
        "providers": [
            {"id": p.value, "name": p.value.replace("_", " ").title(),
             "rate_per_minute": PROVIDER_COSTS.get(p, 0),
             "requires_key": p != CloudProvider.LOCAL}
            for p in CloudProvider
        ]
    }
