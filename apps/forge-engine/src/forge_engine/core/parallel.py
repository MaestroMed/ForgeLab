"""Parallel Processing Pipeline for Multi-GPU/Multi-Worker Analysis."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Check for GPU availability
try:
    import torch
    HAS_TORCH = True
    GPU_COUNT = torch.cuda.device_count() if torch.cuda.is_available() else 0
except ImportError:
    HAS_TORCH = False
    GPU_COUNT = 0


class WorkerType(str, Enum):
    """Types of processing workers."""
    TRANSCRIPTION = "transcription"
    SCENE_DETECTION = "scene_detection"
    FACE_EMOTION = "face_emotion"
    AUDIO_ANALYSIS = "audio_analysis"
    LLM_SCORING = "llm_scoring"
    RENDERING = "rendering"


@dataclass
class WorkerConfig:
    """Configuration for a worker."""
    worker_type: WorkerType
    gpu_id: Optional[int] = None  # None = CPU
    max_concurrent: int = 1
    priority: int = 5  # Lower = higher priority


@dataclass
class AnalysisTask:
    """A task to be processed by a worker."""
    task_id: str
    worker_type: WorkerType
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    priority: int = 5
    gpu_required: bool = False


@dataclass
class TaskResult:
    """Result of a completed task."""
    task_id: str
    worker_type: WorkerType
    success: bool
    result: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0


class ParallelPipeline:
    """
    Manages parallel execution of analysis tasks across multiple workers/GPUs.
    
    Architecture:
    - Transcription: Runs on GPU 0 (Whisper is VRAM-heavy)
    - Scene Detection: Runs on CPU (fast enough)
    - Face/Emotion: Runs on GPU 1 if available, else GPU 0
    - Audio Analysis: Runs on CPU (librosa is CPU-based)
    - LLM Scoring: Runs on Ollama (separate process)
    - Rendering: Uses NVENC on any available GPU
    """
    
    _instance: Optional["ParallelPipeline"] = None
    
    def __init__(self):
        self.gpu_count = GPU_COUNT
        self.workers: Dict[WorkerType, WorkerConfig] = {}
        self._thread_pool = ThreadPoolExecutor(max_workers=4)
        self._task_queue: asyncio.Queue[AnalysisTask] = asyncio.Queue()
        self._results: Dict[str, TaskResult] = {}
        self._running = False
        
        self._configure_workers()
    
    @classmethod
    def get_instance(cls) -> "ParallelPipeline":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def _configure_workers(self):
        """Configure workers based on available hardware."""
        # Transcription (GPU-heavy, needs dedicated GPU)
        self.workers[WorkerType.TRANSCRIPTION] = WorkerConfig(
            worker_type=WorkerType.TRANSCRIPTION,
            gpu_id=0 if self.gpu_count > 0 else None,
            max_concurrent=1,  # Whisper is memory-heavy
            priority=1
        )
        
        # Scene Detection (CPU-based, can run parallel)
        self.workers[WorkerType.SCENE_DETECTION] = WorkerConfig(
            worker_type=WorkerType.SCENE_DETECTION,
            gpu_id=None,  # CPU
            max_concurrent=2,
            priority=3
        )
        
        # Face/Emotion Detection (GPU if available)
        self.workers[WorkerType.FACE_EMOTION] = WorkerConfig(
            worker_type=WorkerType.FACE_EMOTION,
            gpu_id=1 if self.gpu_count > 1 else (0 if self.gpu_count > 0 else None),
            max_concurrent=1,
            priority=2
        )
        
        # Audio Analysis (CPU-based, librosa)
        self.workers[WorkerType.AUDIO_ANALYSIS] = WorkerConfig(
            worker_type=WorkerType.AUDIO_ANALYSIS,
            gpu_id=None,
            max_concurrent=2,
            priority=3
        )
        
        # LLM Scoring (Ollama handles its own GPU)
        self.workers[WorkerType.LLM_SCORING] = WorkerConfig(
            worker_type=WorkerType.LLM_SCORING,
            gpu_id=None,  # Ollama manages GPU
            max_concurrent=3,  # Can batch LLM calls
            priority=4
        )
        
        # Rendering (NVENC)
        self.workers[WorkerType.RENDERING] = WorkerConfig(
            worker_type=WorkerType.RENDERING,
            gpu_id=0 if self.gpu_count > 0 else None,
            max_concurrent=2,  # Can queue multiple encodes
            priority=5
        )
        
        logger.info(f"Configured parallel pipeline: {self.gpu_count} GPUs available")
    
    async def run_parallel_analysis(
        self,
        video_path: str,
        audio_path: str,
        duration: float,
        project_id: str,
        progress_callback: Optional[Callable[[str, float, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Run full analysis pipeline with parallel workers.
        
        Args:
            video_path: Path to video file
            audio_path: Path to audio file
            duration: Video duration
            project_id: Project ID for context
            progress_callback: Callback(stage, progress, message)
        
        Returns:
            Combined analysis results
        """
        results = {
            "transcription": None,
            "scenes": None,
            "faces_emotions": None,
            "audio_events": None,
            "llm_scores": None,
        }
        
        # Create parallel tasks
        # Note: Some tasks have dependencies (LLM scoring needs transcript)
        
        # Phase 1: Independent analyses (can run in parallel)
        phase1_tasks = []
        
        # Transcription
        async def run_transcription():
            if progress_callback:
                progress_callback("transcription", 0, "Démarrage transcription...")
            
            from forge_engine.services.transcription import TranscriptionService
            service = TranscriptionService()
            
            def prog(p):
                if progress_callback:
                    progress_callback("transcription", p, f"Transcription: {p:.0f}%")
            
            result = await service.transcribe(audio_path, progress_callback=prog)
            results["transcription"] = result
            return result
        
        # Scene Detection
        async def run_scene_detection():
            if progress_callback:
                progress_callback("scene_detection", 0, "Détection des scènes...")
            
            from forge_engine.services.scene_detection import SceneDetectionService
            service = SceneDetectionService()
            
            def prog(p):
                if progress_callback:
                    progress_callback("scene_detection", p, f"Scènes: {p:.0f}%")
            
            result = await service.detect_scenes(video_path, progress_callback=prog)
            results["scenes"] = result
            return result
        
        # Face/Emotion Detection
        async def run_face_emotion():
            if progress_callback:
                progress_callback("face_emotion", 0, "Détection visages/émotions...")
            
            from forge_engine.services.emotion_detection import EmotionDetectionService
            service = EmotionDetectionService.get_instance()
            
            if not service.is_available():
                logger.warning("Emotion detection not available, skipping")
                return None
            
            def prog(p):
                if progress_callback:
                    progress_callback("face_emotion", p, f"Émotions: {p:.0f}%")
            
            result = await service.analyze_video(video_path, duration, progress_callback=prog)
            results["faces_emotions"] = result
            return result
        
        # Audio Event Detection
        async def run_audio_analysis():
            if progress_callback:
                progress_callback("audio_analysis", 0, "Analyse audio avancée...")
            
            from forge_engine.services.audio_analysis import AudioAnalyzer
            analyzer = AudioAnalyzer.get_instance()
            
            def prog(p):
                if progress_callback:
                    progress_callback("audio_analysis", p, f"Audio: {p:.0f}%")
            
            result = await analyzer.analyze(audio_path, progress_callback=prog)
            results["audio_events"] = result
            return result
        
        # Run Phase 1 in parallel
        phase1_results = await asyncio.gather(
            run_transcription(),
            run_scene_detection(),
            run_face_emotion(),
            run_audio_analysis(),
            return_exceptions=True
        )
        
        # Log any errors
        for i, result in enumerate(phase1_results):
            if isinstance(result, Exception):
                task_names = ["transcription", "scene_detection", "face_emotion", "audio_analysis"]
                logger.error(f"Phase 1 task {task_names[i]} failed: {result}")
        
        # Phase 2: LLM scoring (needs transcript)
        if results["transcription"] and results["transcription"].get("segments"):
            if progress_callback:
                progress_callback("llm_scoring", 0, "Scoring LLM contextuel...")
            
            try:
                from forge_engine.services.llm_local import LocalLLMService
                llm = LocalLLMService.get_instance()
                
                if await llm.check_availability():
                    # Score a sample of segments
                    segments = results["transcription"]["segments"]
                    sample_size = min(20, len(segments))
                    sample = segments[:sample_size]
                    
                    llm_results = await llm.batch_score_segments(
                        [{"transcript": s.get("text", ""), "duration": 30} for s in sample],
                        max_concurrent=3
                    )
                    results["llm_scores"] = llm_results
                    
                    if progress_callback:
                        progress_callback("llm_scoring", 100, "Scoring LLM terminé")
            except Exception as e:
                logger.error(f"LLM scoring failed: {e}")
        
        return results
    
    async def run_task(
        self,
        task: AnalysisTask
    ) -> TaskResult:
        """Run a single task with appropriate worker."""
        import time
        start = time.time()
        
        try:
            # Get worker config
            config = self.workers.get(task.worker_type)
            
            # Run in thread pool for CPU tasks, directly for async GPU tasks
            if config and config.gpu_id is None:
                # CPU task - run in thread pool
                loop = asyncio.get_event_loop()
                if asyncio.iscoroutinefunction(task.func):
                    result = await task.func(*task.args, **task.kwargs)
                else:
                    result = await loop.run_in_executor(
                        self._thread_pool,
                        lambda: task.func(*task.args, **task.kwargs)
                    )
            else:
                # GPU or async task
                if asyncio.iscoroutinefunction(task.func):
                    result = await task.func(*task.args, **task.kwargs)
                else:
                    result = task.func(*task.args, **task.kwargs)
            
            duration = (time.time() - start) * 1000
            
            return TaskResult(
                task_id=task.task_id,
                worker_type=task.worker_type,
                success=True,
                result=result,
                duration_ms=duration
            )
            
        except Exception as e:
            duration = (time.time() - start) * 1000
            logger.error(f"Task {task.task_id} failed: {e}")
            
            return TaskResult(
                task_id=task.task_id,
                worker_type=task.worker_type,
                success=False,
                error=str(e),
                duration_ms=duration
            )
    
    def get_hardware_info(self) -> Dict[str, Any]:
        """Get information about available hardware."""
        info = {
            "gpu_count": self.gpu_count,
            "gpus": [],
            "workers": {}
        }
        
        # Get GPU info
        if HAS_TORCH and self.gpu_count > 0:
            import torch
            for i in range(self.gpu_count):
                props = torch.cuda.get_device_properties(i)
                info["gpus"].append({
                    "id": i,
                    "name": props.name,
                    "memory_gb": props.total_memory / (1024**3),
                    "compute_capability": f"{props.major}.{props.minor}"
                })
        
        # Worker configurations
        for worker_type, config in self.workers.items():
            info["workers"][worker_type.value] = {
                "gpu_id": config.gpu_id,
                "max_concurrent": config.max_concurrent,
                "priority": config.priority
            }
        
        return info
    
    def shutdown(self):
        """Shutdown the pipeline."""
        self._thread_pool.shutdown(wait=False)


# Convenience functions
def get_parallel_pipeline() -> ParallelPipeline:
    """Get the parallel pipeline instance."""
    return ParallelPipeline.get_instance()


def get_hardware_info() -> Dict[str, Any]:
    """Get hardware information."""
    return ParallelPipeline.get_instance().get_hardware_info()
