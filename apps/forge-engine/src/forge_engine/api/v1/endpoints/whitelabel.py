"""White-label branding and enterprise settings endpoints."""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/branding")
async def get_branding():
    """Get current white-label branding configuration."""
    from forge_engine.services.whitelabel import WhitelabelService
    service = WhitelabelService.get_instance()
    return service.get_branding().to_dict()


@router.put("/branding")
async def update_branding(config: dict):
    """Update white-label branding configuration."""
    from forge_engine.services.whitelabel import BrandingConfig, WhitelabelService
    service = WhitelabelService.get_instance()
    branding = BrandingConfig.from_dict(config)
    service.save_branding(branding)
    return branding.to_dict()


@router.get("/storage/status")
async def get_storage_status():
    """Get S3 storage configuration status."""
    from forge_engine.services.whitelabel import WhitelabelService
    service = WhitelabelService.get_instance()
    cfg = service.get_branding()
    s3 = service.get_s3_client()
    return {
        "s3_enabled": cfg.s3_enabled,
        "s3_configured": s3 is not None,
        "s3_bucket": cfg.s3_bucket,
        "s3_region": cfg.s3_region,
        "s3_custom_endpoint": cfg.s3_endpoint,
    }


@router.post("/storage/test")
async def test_s3_connection():
    """Test S3 connection by listing buckets."""
    from forge_engine.services.whitelabel import WhitelabelService
    service = WhitelabelService.get_instance()
    s3 = service.get_s3_client()
    if not s3:
        raise HTTPException(status_code=400, detail="S3 not configured")
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: s3.list_buckets())
        buckets = [b["Name"] for b in response.get("Buckets", [])]
        return {"connected": True, "buckets": buckets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 connection failed: {e}")


@router.get("/sso/config")
async def get_sso_config():
    """Get SSO configuration (sensitive fields masked)."""
    from forge_engine.services.whitelabel import WhitelabelService
    service = WhitelabelService.get_instance()
    cfg = service.get_branding()
    return {
        "sso_enabled": cfg.sso_enabled,
        "sso_provider": cfg.sso_provider,
        "sso_metadata_url": cfg.sso_metadata_url,
        "configured": cfg.sso_enabled and bool(cfg.sso_metadata_url),
    }
