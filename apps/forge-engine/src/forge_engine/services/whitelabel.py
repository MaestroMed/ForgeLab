"""White-label branding and enterprise configuration service."""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

_BRANDING_FILE = settings.LIBRARY_PATH / "branding.json"


@dataclass
class BrandingConfig:
    """White-label branding configuration."""
    app_name: str = "FORGE LAB"
    app_tagline: str = "Studio de clips viraux"
    primary_color: str = "#00D4FF"      # Forge cyan
    secondary_color: str = "#8B5CF6"    # Purple
    accent_color: str = "#F59E0B"       # Amber
    logo_url: str | None = None
    favicon_url: str | None = None
    custom_domain: str | None = None
    watermark_text: str | None = None
    watermark_position: str = "bottom_right"  # bottom_right | top_left | none
    footer_text: str | None = None
    support_email: str | None = None
    # Enterprise
    sso_enabled: bool = False
    sso_provider: str | None = None     # saml | oidc
    sso_metadata_url: str | None = None
    # Storage
    s3_enabled: bool = False
    s3_bucket: str | None = None
    s3_region: str = "us-east-1"
    s3_endpoint: str | None = None      # MinIO or custom S3-compatible
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_path_prefix: str = "forge-clips"

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, data: dict) -> "BrandingConfig":
        cfg = cls()
        for key, val in data.items():
            if hasattr(cfg, key):
                setattr(cfg, key, val)
        return cfg


class WhitelabelService:
    """Manages white-label branding and enterprise storage."""

    _instance: Optional["WhitelabelService"] = None
    _config: BrandingConfig | None = None

    @classmethod
    def get_instance(cls) -> "WhitelabelService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_branding(self) -> BrandingConfig:
        """Get current branding config (cached)."""
        if self._config is None:
            self._load()
        return self._config  # type: ignore

    def _load(self) -> None:
        if _BRANDING_FILE.exists():
            try:
                data = json.loads(_BRANDING_FILE.read_text())
                self._config = BrandingConfig.from_dict(data)
                logger.info("Branding config loaded from %s", _BRANDING_FILE)
                return
            except Exception as e:
                logger.warning("Failed to load branding config: %s", e)
        self._config = BrandingConfig()

    def save_branding(self, config: BrandingConfig) -> None:
        """Persist branding config."""
        self._config = config
        try:
            _BRANDING_FILE.parent.mkdir(parents=True, exist_ok=True)
            _BRANDING_FILE.write_text(json.dumps(config.to_dict(), indent=2))
            logger.info("Branding config saved")
        except Exception as e:
            logger.error("Failed to save branding config: %s", e)

    def get_s3_client(self):
        """Return a boto3 S3 client if configured, else None."""
        cfg = self.get_branding()
        if not cfg.s3_enabled or not cfg.s3_access_key:
            return None
        try:
            import boto3
            kwargs = dict(
                aws_access_key_id=cfg.s3_access_key,
                aws_secret_access_key=cfg.s3_secret_key,
                region_name=cfg.s3_region,
            )
            if cfg.s3_endpoint:
                kwargs["endpoint_url"] = cfg.s3_endpoint
            return boto3.client("s3", **kwargs)
        except Exception as e:
            logger.error("Failed to create S3 client: %s", e)
            return None

    async def upload_to_s3(self, local_path: Path, object_key: str | None = None) -> str | None:
        """Upload a file to S3 and return the public URL."""
        cfg = self.get_branding()
        if not cfg.s3_enabled or not cfg.s3_bucket:
            return None
        s3 = self.get_s3_client()
        if not s3:
            return None

        key = object_key or f"{cfg.s3_path_prefix}/{local_path.name}"

        import asyncio
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                lambda: s3.upload_file(str(local_path), cfg.s3_bucket, key,
                                       ExtraArgs={"ContentType": "video/mp4", "ACL": "public-read"})
            )
            if cfg.s3_endpoint:
                return f"{cfg.s3_endpoint}/{cfg.s3_bucket}/{key}"
            return f"https://{cfg.s3_bucket}.s3.{cfg.s3_region}.amazonaws.com/{key}"
        except Exception as e:
            logger.error("S3 upload failed: %s", e)
            return None
