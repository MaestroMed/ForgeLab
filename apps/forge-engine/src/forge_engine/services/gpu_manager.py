"""GPU Manager for multi-GPU support and automatic device allocation.

Detects available GPUs, tracks VRAM usage, and distributes work
across multiple devices for maximum throughput.

Supports:
- Single GPU (current RTX 4070 Ti)
- Dual GPU (future RTX 5090 + 4070 Ti)
- Multi-GPU servers
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class GPUInfo:
    """Information about a detected GPU."""
    index: int
    name: str
    total_vram_gb: float
    free_vram_gb: float
    used_vram_gb: float
    temperature: int | None
    power_draw: float | None
    utilization: int | None

    @property
    def vram_usage_percent(self) -> float:
        return (self.used_vram_gb / self.total_vram_gb * 100) if self.total_vram_gb > 0 else 0

    @property
    def is_available(self) -> bool:
        """Check if GPU has enough free VRAM for Whisper."""
        # Need at least 4GB free for Whisper large-v3
        return self.free_vram_gb >= 4.0

    @property
    def recommended_batch_size(self) -> int:
        """Get recommended Whisper batch size based on VRAM."""
        if self.total_vram_gb >= 24:  # 4090, 5090
            return 32
        elif self.total_vram_gb >= 16:  # 5080
            return 24
        elif self.total_vram_gb >= 12:  # 4070 Ti, 3080
            return 16
        elif self.total_vram_gb >= 8:  # 3070
            return 8
        else:
            return 4


@dataclass
class GPUAllocation:
    """Tracks which GPU is allocated to which task."""
    gpu_index: int
    task_id: str
    task_type: str  # "whisper", "ffmpeg", etc.
    started_at: float


class GPUManager:
    """Manages GPU resources for multi-GPU systems.

    Features:
    - Automatic GPU detection
    - VRAM tracking
    - Load balancing across GPUs
    - Device reservation for tasks
    """

    _instance: Optional["GPUManager"] = None

    def __init__(self):
        self._gpus: list[GPUInfo] = []
        self._allocations: dict[str, GPUAllocation] = {}
        self._lock = asyncio.Lock()
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "GPUManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def initialize(self) -> bool:
        """Initialize GPU detection."""
        if self._initialized:
            return True

        async with self._lock:
            if self._initialized:
                return True

            self._gpus = await self._detect_gpus()
            self._initialized = True

            if self._gpus:
                logger.info(
                    "GPU Manager initialized: %d GPU(s) detected",
                    len(self._gpus)
                )
                for gpu in self._gpus:
                    logger.info(
                        "  GPU %d: %s (%.1f GB total, %.1f GB free)",
                        gpu.index, gpu.name, gpu.total_vram_gb, gpu.free_vram_gb
                    )
            else:
                logger.warning("No GPUs detected, will use CPU")

            return bool(self._gpus)

    async def _detect_gpus(self) -> list[GPUInfo]:
        """Detect available NVIDIA GPUs using nvidia-smi."""
        gpus = []

        try:
            # Query nvidia-smi for GPU info
            result = await asyncio.create_subprocess_exec(
                "nvidia-smi",
                "--query-gpu=index,name,memory.total,memory.free,memory.used,temperature.gpu,power.draw,utilization.gpu",
                "--format=csv,noheader,nounits",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()

            if result.returncode != 0:
                logger.warning("nvidia-smi failed: %s", stderr.decode())
                return []

            for line in stdout.decode().strip().split("\n"):
                if not line.strip():
                    continue

                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 5:
                    try:
                        gpus.append(GPUInfo(
                            index=int(parts[0]),
                            name=parts[1],
                            total_vram_gb=float(parts[2]) / 1024,  # MB to GB
                            free_vram_gb=float(parts[3]) / 1024,
                            used_vram_gb=float(parts[4]) / 1024,
                            temperature=int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else None,
                            power_draw=float(parts[6]) if len(parts) > 6 and parts[6].replace('.', '').isdigit() else None,
                            utilization=int(parts[7]) if len(parts) > 7 and parts[7].isdigit() else None,
                        ))
                    except (ValueError, IndexError) as e:
                        logger.warning("Failed to parse GPU info: %s", e)

        except FileNotFoundError:
            logger.warning("nvidia-smi not found, no NVIDIA GPU support")
        except Exception as e:
            logger.exception("GPU detection failed: %s", e)

        return gpus

    async def refresh_gpu_status(self) -> list[GPUInfo]:
        """Refresh GPU status (VRAM, temperature, etc.)."""
        self._gpus = await self._detect_gpus()
        return self._gpus

    @property
    def gpu_count(self) -> int:
        """Number of detected GPUs."""
        return len(self._gpus)

    @property
    def gpus(self) -> list[GPUInfo]:
        """List of detected GPUs."""
        return self._gpus.copy()

    @property
    def has_cuda(self) -> bool:
        """Check if any CUDA GPU is available."""
        return len(self._gpus) > 0

    @property
    def total_vram_gb(self) -> float:
        """Total VRAM across all GPUs."""
        return sum(gpu.total_vram_gb for gpu in self._gpus)

    @property
    def free_vram_gb(self) -> float:
        """Free VRAM across all GPUs."""
        return sum(gpu.free_vram_gb for gpu in self._gpus)

    def get_best_gpu(self, min_free_vram_gb: float = 4.0) -> GPUInfo | None:
        """Get the best available GPU for a task.

        Returns the GPU with the most free VRAM that meets the minimum requirement.
        """
        available = [
            gpu for gpu in self._gpus
            if gpu.free_vram_gb >= min_free_vram_gb
        ]

        if not available:
            return None

        # Sort by free VRAM (most free first)
        return max(available, key=lambda g: g.free_vram_gb)

    def get_gpu(self, index: int) -> GPUInfo | None:
        """Get GPU by index."""
        for gpu in self._gpus:
            if gpu.index == index:
                return gpu
        return None

    async def allocate_gpu(
        self,
        task_id: str,
        task_type: str,
        min_vram_gb: float = 4.0,
        preferred_gpu: int | None = None
    ) -> int | None:
        """Allocate a GPU for a task.

        Args:
            task_id: Unique task identifier
            task_type: Type of task ("whisper", "ffmpeg", etc.)
            min_vram_gb: Minimum required free VRAM
            preferred_gpu: Preferred GPU index (if available)

        Returns:
            GPU index if allocated, None if no GPU available
        """
        async with self._lock:
            # Refresh GPU status
            await self.refresh_gpu_status()

            # Try preferred GPU first
            if preferred_gpu is not None:
                gpu = self.get_gpu(preferred_gpu)
                if gpu and gpu.free_vram_gb >= min_vram_gb:
                    self._allocations[task_id] = GPUAllocation(
                        gpu_index=preferred_gpu,
                        task_id=task_id,
                        task_type=task_type,
                        started_at=asyncio.get_event_loop().time()
                    )
                    logger.info(
                        "Allocated GPU %d (%s) to task %s",
                        preferred_gpu, gpu.name, task_id
                    )
                    return preferred_gpu

            # Get best available GPU
            best = self.get_best_gpu(min_vram_gb)
            if best:
                self._allocations[task_id] = GPUAllocation(
                    gpu_index=best.index,
                    task_id=task_id,
                    task_type=task_type,
                    started_at=asyncio.get_event_loop().time()
                )
                logger.info(
                    "Allocated GPU %d (%s) to task %s",
                    best.index, best.name, task_id
                )
                return best.index

            logger.warning(
                "No GPU available for task %s (need %.1f GB free)",
                task_id, min_vram_gb
            )
            return None

    async def release_gpu(self, task_id: str):
        """Release GPU allocation for a task."""
        async with self._lock:
            if task_id in self._allocations:
                allocation = self._allocations.pop(task_id)
                logger.info(
                    "Released GPU %d from task %s",
                    allocation.gpu_index, task_id
                )

    def release_vram(self) -> None:
        """Release unused VRAM after heavy operations."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.info("Released VRAM")
        except Exception as e:
            logger.debug("VRAM release skipped: %s", e)

    def get_vram_usage(self) -> dict:
        """Get current VRAM usage in MB."""
        try:
            import torch
            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1024 / 1024
                reserved = torch.cuda.memory_reserved() / 1024 / 1024
                return {"allocated_mb": round(allocated), "reserved_mb": round(reserved)}
        except Exception:
            pass
        return {"allocated_mb": 0, "reserved_mb": 0}

    def get_optimal_batch_size(self, gpu_index: int = 0) -> int:
        """Get optimal Whisper batch size for a GPU."""
        gpu = self.get_gpu(gpu_index)
        if gpu:
            return gpu.recommended_batch_size
        return 16  # Default

    def get_cuda_device_string(self, gpu_index: int = 0) -> str:
        """Get CUDA device string for PyTorch/ctranslate2."""
        if self.has_cuda:
            return f"cuda:{gpu_index}"
        return "cpu"

    def get_whisper_device_config(
        self,
        gpu_index: int = 0
    ) -> dict[str, any]:
        """Get Whisper configuration for a specific GPU.

        Returns optimized settings based on GPU capabilities.
        """
        gpu = self.get_gpu(gpu_index)

        if not gpu:
            return {
                "device": "cpu",
                "compute_type": "float32",
                "batch_size": 1,
                "num_workers": 1
            }

        # Determine compute type based on GPU generation
        # RTX 30xx/40xx/50xx support efficient int8
        name_lower = gpu.name.lower()
        if any(x in name_lower for x in ["rtx 30", "rtx 40", "rtx 50"]):
            compute_type = "int8_float16"  # Best for modern GPUs
        else:
            compute_type = "float16"

        # Determine batch size based on VRAM
        batch_size = gpu.recommended_batch_size

        # Determine workers based on VRAM
        if gpu.total_vram_gb >= 24:
            num_workers = 4
        elif gpu.total_vram_gb >= 12:
            num_workers = 2
        else:
            num_workers = 1

        return {
            "device": f"cuda:{gpu_index}",
            "compute_type": compute_type,
            "batch_size": batch_size,
            "num_workers": num_workers
        }

    async def get_status(self) -> dict:
        """Get current GPU manager status."""
        await self.refresh_gpu_status()

        return {
            "gpu_count": self.gpu_count,
            "has_cuda": self.has_cuda,
            "total_vram_gb": round(self.total_vram_gb, 1),
            "free_vram_gb": round(self.free_vram_gb, 1),
            "gpus": [
                {
                    "index": gpu.index,
                    "name": gpu.name,
                    "total_vram_gb": round(gpu.total_vram_gb, 1),
                    "free_vram_gb": round(gpu.free_vram_gb, 1),
                    "vram_usage_percent": round(gpu.vram_usage_percent, 1),
                    "temperature": gpu.temperature,
                    "utilization": gpu.utilization,
                    "is_available": gpu.is_available,
                    "recommended_batch_size": gpu.recommended_batch_size,
                }
                for gpu in self._gpus
            ],
            "active_allocations": [
                {
                    "task_id": alloc.task_id,
                    "task_type": alloc.task_type,
                    "gpu_index": alloc.gpu_index,
                }
                for alloc in self._allocations.values()
            ]
        }
