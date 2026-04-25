"""Resource scheduler — slot-based concurrency control for GPU-aware jobs.

The JobManager limits total workers but doesn't know that "transcribe" and
"render_final" both compete for the GPU. This scheduler exposes typed slots
(gpu, nvenc, cpu, network) so jobs can await the right resource.

Usage:
    sched = ResourceScheduler.get_instance()
    async with sched.gpu_slot("whisper.transcribe"):
        await transcribe(...)
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ResourceConfig:
    gpu_slots: int = 1       # One heavy GPU job at a time (whisper OR render)
    nvenc_slots: int = 1     # One NVENC encode at a time (hardware limit per card)
    cpu_slots: int = 4       # Light CPU jobs (probe, cleanup)
    network_slots: int = 6   # Parallel downloads


class ResourceScheduler:
    """Singleton semaphore bundle for GPU-aware scheduling."""

    _instance: "ResourceScheduler | None" = None

    def __init__(self, config: ResourceConfig | None = None) -> None:
        cfg = config or ResourceConfig()
        self._gpu_sem = asyncio.Semaphore(cfg.gpu_slots)
        self._nvenc_sem = asyncio.Semaphore(cfg.nvenc_slots)
        self._cpu_sem = asyncio.Semaphore(cfg.cpu_slots)
        self._network_sem = asyncio.Semaphore(cfg.network_slots)
        self._config = cfg

    @classmethod
    def get_instance(cls) -> "ResourceScheduler":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @asynccontextmanager
    async def gpu_slot(self, label: str = ""):
        await self._gpu_sem.acquire()
        logger.debug("gpu_slot acquired: %s", label)
        try:
            yield
        finally:
            self._gpu_sem.release()

    @asynccontextmanager
    async def nvenc_slot(self, label: str = ""):
        await self._nvenc_sem.acquire()
        try:
            yield
        finally:
            self._nvenc_sem.release()

    @asynccontextmanager
    async def cpu_slot(self, label: str = ""):
        await self._cpu_sem.acquire()
        try:
            yield
        finally:
            self._cpu_sem.release()

    @asynccontextmanager
    async def network_slot(self, label: str = ""):
        await self._network_sem.acquire()
        try:
            yield
        finally:
            self._network_sem.release()

    def snapshot(self) -> dict:
        """Return current slot availability."""
        return {
            "gpu": {"total": self._config.gpu_slots, "free": self._gpu_sem._value},  # type: ignore[attr-defined]
            "nvenc": {"total": self._config.nvenc_slots, "free": self._nvenc_sem._value},  # type: ignore[attr-defined]
            "cpu": {"total": self._config.cpu_slots, "free": self._cpu_sem._value},  # type: ignore[attr-defined]
            "network": {"total": self._config.network_slots, "free": self._network_sem._value},  # type: ignore[attr-defined]
        }
