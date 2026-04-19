"""Cloud GPU processing service for RunPod and Modal.

Delegates heavy compute (transcription + export) to cloud GPUs when:
- Local GPU unavailable, OR
- Queue is full and cloud overflow is enabled.

Cost per clip is estimated and shown to the user before submission.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Optional

import httpx

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)


class CloudProvider(StrEnum):
    LOCAL = "local"
    RUNPOD = "runpod"
    MODAL = "modal"
    LAMBDA = "lambda_labs"


@dataclass
class CloudJobResult:
    job_id: str
    provider: CloudProvider
    status: str        # pending | running | completed | failed
    output_url: str | None = None
    cost_usd: float = 0.0
    duration_seconds: float = 0.0
    error: str | None = None


# Pricing estimates (USD per minute of video processed)
PROVIDER_COSTS = {
    CloudProvider.RUNPOD: 0.0004,   # ~$0.024/hour, ~60s of video per minute
    CloudProvider.MODAL: 0.0003,
    CloudProvider.LAMBDA: 0.0005,
}

# GPU that can process ~60s of video in ~45s (real-time or better)
THROUGHPUT_RATIO = 1.33  # processes 1.33x real-time


class CloudGPUService:
    """Service for delegating heavy compute to cloud GPU providers."""

    _instance: Optional["CloudGPUService"] = None

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        self._provider = CloudProvider(
            getattr(settings, "CLOUD_GPU_PROVIDER", "local")
        )
        self._runpod_key = getattr(settings, "CLOUD_RUNPOD_API_KEY", "")
        self._modal_token = getattr(settings, "CLOUD_MODAL_TOKEN_ID", "")
        self._modal_secret = getattr(settings, "CLOUD_MODAL_TOKEN_SECRET", "")

    @classmethod
    def get_instance(cls) -> "CloudGPUService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_cloud_enabled(self) -> bool:
        """Return True if a cloud provider is configured."""
        return self._provider != CloudProvider.LOCAL

    def estimate_cost(self, video_duration_seconds: float, provider: CloudProvider | None = None) -> dict:
        """Estimate processing cost for a video."""
        p = provider or self._provider
        if p == CloudProvider.LOCAL:
            return {"provider": "local", "cost_usd": 0.0, "estimated_seconds": video_duration_seconds / THROUGHPUT_RATIO}

        rate = PROVIDER_COSTS.get(p, 0.0005)
        cost = (video_duration_seconds / 60) * rate
        processing_time = video_duration_seconds / THROUGHPUT_RATIO

        return {
            "provider": p.value,
            "cost_usd": round(cost, 5),
            "cost_display": f"~${cost:.4f}",
            "estimated_seconds": round(processing_time),
            "rate_per_minute": rate,
        }

    async def submit_job(
        self,
        video_url: str,
        job_type: str,
        params: dict[str, Any],
        provider: CloudProvider | None = None,
    ) -> CloudJobResult:
        """Submit a processing job to a cloud provider."""
        p = provider or self._provider

        if p == CloudProvider.RUNPOD:
            return await self._submit_runpod(video_url, job_type, params)
        elif p == CloudProvider.MODAL:
            return await self._submit_modal(video_url, job_type, params)
        else:
            return CloudJobResult(
                job_id="local",
                provider=CloudProvider.LOCAL,
                status="local_processing",
                error="Cloud provider not configured — processing locally",
            )

    async def _submit_runpod(self, video_url: str, job_type: str, params: dict) -> CloudJobResult:
        """Submit to RunPod Serverless."""
        if not self._runpod_key:
            return CloudJobResult(
                job_id="", provider=CloudProvider.RUNPOD, status="failed",
                error="FORGE_CLOUD_RUNPOD_API_KEY not set"
            )
        # RunPod Serverless API
        endpoint_id = getattr(settings, "CLOUD_RUNPOD_ENDPOINT_ID", "")
        if not endpoint_id:
            return CloudJobResult(job_id="", provider=CloudProvider.RUNPOD, status="failed", error="FORGE_CLOUD_RUNPOD_ENDPOINT_ID not set")

        try:
            resp = await self._client.post(
                f"https://api.runpod.io/v2/{endpoint_id}/run",
                headers={"Authorization": f"Bearer {self._runpod_key}"},
                json={"input": {"video_url": video_url, "job_type": job_type, **params}},
            )
            if resp.status_code == 200:
                data = resp.json()
                return CloudJobResult(
                    job_id=data.get("id", ""),
                    provider=CloudProvider.RUNPOD,
                    status=data.get("status", "pending"),
                )
            return CloudJobResult(job_id="", provider=CloudProvider.RUNPOD, status="failed", error=resp.text[:200])
        except Exception as e:
            return CloudJobResult(job_id="", provider=CloudProvider.RUNPOD, status="failed", error=str(e))

    async def _submit_modal(self, video_url: str, job_type: str, params: dict) -> CloudJobResult:
        """Submit to Modal Labs."""
        if not self._modal_token:
            return CloudJobResult(job_id="", provider=CloudProvider.MODAL, status="failed", error="FORGE_CLOUD_MODAL_TOKEN_ID not set")

        try:
            resp = await self._client.post(
                "https://api.modal.com/v1/functions/forge-process/call",
                headers={"Authorization": f"Token {self._modal_token}:{self._modal_secret}"},
                json={"video_url": video_url, "job_type": job_type, "params": params},
            )
            if resp.status_code in (200, 202):
                data = resp.json()
                return CloudJobResult(
                    job_id=data.get("call_id", ""),
                    provider=CloudProvider.MODAL,
                    status="pending",
                )
            return CloudJobResult(job_id="", provider=CloudProvider.MODAL, status="failed", error=resp.text[:200])
        except Exception as e:
            return CloudJobResult(job_id="", provider=CloudProvider.MODAL, status="failed", error=str(e))

    async def get_job_status(self, job_id: str, provider: CloudProvider | None = None) -> CloudJobResult:
        """Poll job status from cloud provider."""
        p = provider or self._provider
        if p == CloudProvider.RUNPOD:
            endpoint_id = getattr(settings, "CLOUD_RUNPOD_ENDPOINT_ID", "")
            try:
                resp = await self._client.get(
                    f"https://api.runpod.io/v2/{endpoint_id}/status/{job_id}",
                    headers={"Authorization": f"Bearer {self._runpod_key}"},
                )
                data = resp.json()
                return CloudJobResult(
                    job_id=job_id, provider=p,
                    status=data.get("status", "unknown"),
                    output_url=data.get("output", {}).get("clip_url") if isinstance(data.get("output"), dict) else None,
                )
            except Exception as e:
                return CloudJobResult(job_id=job_id, provider=p, status="error", error=str(e))

        return CloudJobResult(job_id=job_id, provider=p, status="unknown")

    async def close(self):
        await self._client.aclose()
