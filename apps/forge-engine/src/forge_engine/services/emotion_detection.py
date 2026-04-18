"""Facial Emotion Detection Service using DeepFace/FER."""

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Check for available backends
try:
    from deepface import DeepFace
    HAS_DEEPFACE = True
except ImportError:
    HAS_DEEPFACE = False
    logger.info("DeepFace not available, emotion detection will use FER fallback")

try:
    from fer import FER
    HAS_FER = True
except ImportError:
    HAS_FER = False
    logger.info("FER not available")

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


@dataclass
class EmotionFrame:
    """Emotion detection result for a single frame."""
    timestamp: float
    face_detected: bool = False
    dominant_emotion: str = "neutral"
    emotion_scores: Dict[str, float] = field(default_factory=dict)
    face_rect: Optional[Dict[str, int]] = None
    confidence: float = 0.0


@dataclass
class EmotionSegment:
    """Aggregated emotion data for a segment."""
    start_time: float
    end_time: float
    dominant_emotion: str = "neutral"
    emotion_distribution: Dict[str, float] = field(default_factory=dict)
    peak_emotions: List[Dict[str, Any]] = field(default_factory=list)
    face_detection_rate: float = 0.0
    average_confidence: float = 0.0


@dataclass
class EmotionAnalysisResult:
    """Complete emotion analysis result for a video."""
    frames: List[EmotionFrame]
    timeline: List[Dict[str, Any]]
    segments: List[EmotionSegment]
    summary: Dict[str, Any]
    backend_used: str


class EmotionDetectionService:
    """Service for detecting facial emotions in video content."""
    
    # Emotion categories with viral potential scores
    EMOTION_VIRAL_WEIGHTS = {
        "happy": 0.9,      # Very viral - joy is shareable
        "surprise": 1.0,   # Most viral - unexpected reactions
        "angry": 0.7,      # Viral - rage moments
        "sad": 0.4,        # Less viral but emotional
        "fear": 0.6,       # Viral for gaming/horror content
        "disgust": 0.5,    # Can be viral in reaction context
        "neutral": 0.1,    # Not viral
    }
    
    _instance: Optional["EmotionDetectionService"] = None
    
    def __init__(self):
        self.backend = self._detect_backend()
        self._fer_detector = None
        self._deepface_initialized = False
        self.sample_interval = 0.5  # Sample every 0.5 seconds for emotions
    
    @classmethod
    def get_instance(cls) -> "EmotionDetectionService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def _detect_backend(self) -> str:
        """Detect best available backend."""
        if HAS_DEEPFACE:
            return "deepface"
        elif HAS_FER:
            return "fer"
        else:
            return "none"
    
    def is_available(self) -> bool:
        """Check if emotion detection is available."""
        return self.backend != "none" and HAS_CV2 and HAS_NUMPY
    
    def _get_fer_detector(self) -> Optional["FER"]:
        """Get or initialize FER detector."""
        if not HAS_FER:
            return None
        if self._fer_detector is None:
            self._fer_detector = FER(mtcnn=True)
        return self._fer_detector
    
    async def analyze_video(
        self,
        video_path: str,
        duration: float,
        start_time: float = 0,
        end_time: Optional[float] = None,
        progress_callback: Optional[Callable[[float], None]] = None
    ) -> Optional[EmotionAnalysisResult]:
        """
        Analyze emotions in a video.
        
        Args:
            video_path: Path to video file
            duration: Total video duration
            start_time: Start time for analysis
            end_time: End time for analysis (defaults to duration)
            progress_callback: Progress callback (0-100)
        
        Returns:
            EmotionAnalysisResult or None if unavailable
        """
        if not self.is_available():
            logger.warning("Emotion detection not available")
            return None
        
        end_time = end_time or duration
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._analyze_sync(
                video_path, start_time, end_time, progress_callback
            )
        )
    
    def _analyze_sync(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        progress_callback: Optional[Callable[[float], None]] = None
    ) -> Optional[EmotionAnalysisResult]:
        """Synchronous emotion analysis."""
        import cv2
        import numpy as np
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video: {video_path}")
            return None
        
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        
        frames: List[EmotionFrame] = []
        segment_duration = end_time - start_time
        sample_count = int(segment_duration / self.sample_interval)
        
        for i in range(sample_count):
            current_time = start_time + (i * self.sample_interval)
            target_frame = int(current_time * fps)
            
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            ret, frame = cap.read()
            
            if not ret:
                continue
            
            # Detect emotion
            emotion_frame = self._detect_emotion_frame(frame, current_time)
            frames.append(emotion_frame)
            
            if progress_callback:
                progress_callback((i + 1) / sample_count * 80)
        
        cap.release()
        
        if not frames:
            return None
        
        if progress_callback:
            progress_callback(85)
        
        # Build timeline
        timeline = self._build_timeline(frames)
        
        if progress_callback:
            progress_callback(90)
        
        # Segment emotions
        segments = self._segment_emotions(frames, segment_duration)
        
        if progress_callback:
            progress_callback(95)
        
        # Generate summary
        summary = self._generate_summary(frames, segments)
        
        if progress_callback:
            progress_callback(100)
        
        return EmotionAnalysisResult(
            frames=frames,
            timeline=timeline,
            segments=segments,
            summary=summary,
            backend_used=self.backend
        )
    
    def _detect_emotion_frame(
        self,
        frame: "np.ndarray",
        timestamp: float
    ) -> EmotionFrame:
        """Detect emotion in a single frame."""
        import numpy as np
        
        if self.backend == "deepface":
            return self._detect_with_deepface(frame, timestamp)
        elif self.backend == "fer":
            return self._detect_with_fer(frame, timestamp)
        else:
            return EmotionFrame(timestamp=timestamp, face_detected=False)
    
    def _detect_with_deepface(
        self,
        frame: "np.ndarray",
        timestamp: float
    ) -> EmotionFrame:
        """Detect emotion using DeepFace."""
        try:
            # DeepFace.analyze returns list of faces
            results = DeepFace.analyze(
                frame,
                actions=['emotion'],
                enforce_detection=False,
                silent=True
            )
            
            if not results:
                return EmotionFrame(timestamp=timestamp, face_detected=False)
            
            # Take first face (most prominent)
            result = results[0] if isinstance(results, list) else results
            
            emotions = result.get('emotion', {})
            dominant = result.get('dominant_emotion', 'neutral')
            region = result.get('region', {})
            
            # Normalize scores to 0-1
            emotion_scores = {k: v / 100.0 for k, v in emotions.items()}
            
            face_rect = None
            if region:
                face_rect = {
                    "x": region.get('x', 0),
                    "y": region.get('y', 0),
                    "width": region.get('w', 0),
                    "height": region.get('h', 0)
                }
            
            return EmotionFrame(
                timestamp=timestamp,
                face_detected=True,
                dominant_emotion=dominant,
                emotion_scores=emotion_scores,
                face_rect=face_rect,
                confidence=emotion_scores.get(dominant, 0)
            )
            
        except Exception as e:
            logger.debug(f"DeepFace detection failed at {timestamp:.1f}s: {e}")
            return EmotionFrame(timestamp=timestamp, face_detected=False)
    
    def _detect_with_fer(
        self,
        frame: "np.ndarray",
        timestamp: float
    ) -> EmotionFrame:
        """Detect emotion using FER."""
        try:
            detector = self._get_fer_detector()
            if detector is None:
                return EmotionFrame(timestamp=timestamp, face_detected=False)
            
            # FER returns list of dicts with 'box' and 'emotions'
            results = detector.detect_emotions(frame)
            
            if not results:
                return EmotionFrame(timestamp=timestamp, face_detected=False)
            
            # Take first face
            result = results[0]
            emotions = result.get('emotions', {})
            box = result.get('box', [0, 0, 0, 0])
            
            # Find dominant emotion
            dominant = max(emotions, key=emotions.get) if emotions else 'neutral'
            
            face_rect = {
                "x": box[0] if len(box) > 0 else 0,
                "y": box[1] if len(box) > 1 else 0,
                "width": box[2] if len(box) > 2 else 0,
                "height": box[3] if len(box) > 3 else 0
            }
            
            return EmotionFrame(
                timestamp=timestamp,
                face_detected=True,
                dominant_emotion=dominant,
                emotion_scores=emotions,
                face_rect=face_rect,
                confidence=emotions.get(dominant, 0)
            )
            
        except Exception as e:
            logger.debug(f"FER detection failed at {timestamp:.1f}s: {e}")
            return EmotionFrame(timestamp=timestamp, face_detected=False)
    
    def _build_timeline(
        self,
        frames: List[EmotionFrame]
    ) -> List[Dict[str, Any]]:
        """Build emotion timeline for visualization."""
        return [
            {
                "time": f.timestamp,
                "emotion": f.dominant_emotion,
                "confidence": f.confidence,
                "viral_score": self.EMOTION_VIRAL_WEIGHTS.get(f.dominant_emotion, 0.1),
                "scores": f.emotion_scores
            }
            for f in frames if f.face_detected
        ]
    
    def _segment_emotions(
        self,
        frames: List[EmotionFrame],
        duration: float,
        segment_duration: float = 5.0
    ) -> List[EmotionSegment]:
        """Segment emotions into time windows."""
        segments: List[EmotionSegment] = []
        
        if not frames:
            return segments
        
        start_time = frames[0].timestamp
        end_time = start_time + duration
        current_start = start_time
        
        while current_start < end_time:
            current_end = min(current_start + segment_duration, end_time)
            
            # Get frames in this segment
            segment_frames = [
                f for f in frames
                if current_start <= f.timestamp < current_end
            ]
            
            if segment_frames:
                segment = self._aggregate_segment(
                    segment_frames, current_start, current_end
                )
                segments.append(segment)
            
            current_start = current_end
        
        return segments
    
    def _aggregate_segment(
        self,
        frames: List[EmotionFrame],
        start_time: float,
        end_time: float
    ) -> EmotionSegment:
        """Aggregate emotion data for a segment."""
        # Count detected faces
        detected_frames = [f for f in frames if f.face_detected]
        face_rate = len(detected_frames) / len(frames) if frames else 0
        
        if not detected_frames:
            return EmotionSegment(
                start_time=start_time,
                end_time=end_time,
                dominant_emotion="neutral",
                face_detection_rate=0
            )
        
        # Aggregate emotion scores
        emotion_totals: Dict[str, float] = {}
        confidence_sum = 0
        
        for f in detected_frames:
            for emotion, score in f.emotion_scores.items():
                emotion_totals[emotion] = emotion_totals.get(emotion, 0) + score
            confidence_sum += f.confidence
        
        # Normalize
        count = len(detected_frames)
        emotion_distribution = {k: v / count for k, v in emotion_totals.items()}
        avg_confidence = confidence_sum / count
        
        # Find dominant emotion
        dominant = max(emotion_distribution, key=emotion_distribution.get) \
            if emotion_distribution else "neutral"
        
        # Find peak emotion moments (high confidence non-neutral emotions)
        peaks = []
        for f in detected_frames:
            if f.dominant_emotion != "neutral" and f.confidence > 0.5:
                peaks.append({
                    "time": f.timestamp,
                    "emotion": f.dominant_emotion,
                    "confidence": f.confidence,
                    "viral_potential": self.EMOTION_VIRAL_WEIGHTS.get(
                        f.dominant_emotion, 0.1
                    )
                })
        
        # Sort by viral potential and keep top 3
        peaks.sort(key=lambda x: x["viral_potential"], reverse=True)
        peaks = peaks[:3]
        
        return EmotionSegment(
            start_time=start_time,
            end_time=end_time,
            dominant_emotion=dominant,
            emotion_distribution=emotion_distribution,
            peak_emotions=peaks,
            face_detection_rate=face_rate,
            average_confidence=avg_confidence
        )
    
    def _generate_summary(
        self,
        frames: List[EmotionFrame],
        segments: List[EmotionSegment]
    ) -> Dict[str, Any]:
        """Generate overall emotion summary."""
        detected = [f for f in frames if f.face_detected]
        
        if not detected:
            return {
                "total_frames_analyzed": len(frames),
                "faces_detected": 0,
                "detection_rate": 0,
                "dominant_emotion": "unknown",
                "emotion_distribution": {},
                "viral_potential_score": 0,
                "peak_moments": []
            }
        
        # Aggregate all emotion scores
        emotion_totals: Dict[str, float] = {}
        for f in detected:
            for emotion, score in f.emotion_scores.items():
                emotion_totals[emotion] = emotion_totals.get(emotion, 0) + score
        
        count = len(detected)
        distribution = {k: v / count for k, v in emotion_totals.items()}
        dominant = max(distribution, key=distribution.get) if distribution else "neutral"
        
        # Calculate viral potential score
        viral_score = sum(
            distribution.get(emotion, 0) * weight
            for emotion, weight in self.EMOTION_VIRAL_WEIGHTS.items()
        )
        
        # Get all peak moments from segments
        all_peaks = []
        for seg in segments:
            all_peaks.extend(seg.peak_emotions)
        
        # Sort and keep top peaks
        all_peaks.sort(key=lambda x: x["viral_potential"], reverse=True)
        top_peaks = all_peaks[:10]
        
        return {
            "total_frames_analyzed": len(frames),
            "faces_detected": count,
            "detection_rate": count / len(frames) if frames else 0,
            "dominant_emotion": dominant,
            "emotion_distribution": distribution,
            "viral_potential_score": viral_score,
            "peak_moments": top_peaks
        }
    
    def get_emotion_score_for_segment(
        self,
        emotion_result: EmotionAnalysisResult,
        start_time: float,
        end_time: float
    ) -> Dict[str, Any]:
        """
        Get emotion-based viral score for a specific time segment.
        
        Returns a score contribution and tags based on detected emotions.
        """
        # Filter frames for this segment
        segment_frames = [
            f for f in emotion_result.frames
            if start_time <= f.timestamp <= end_time and f.face_detected
        ]
        
        if not segment_frames:
            return {
                "emotion_score": 0,
                "emotion_tags": [],
                "peak_emotion": None,
                "peak_confidence": 0
            }
        
        # Calculate average viral potential
        viral_scores = [
            self.EMOTION_VIRAL_WEIGHTS.get(f.dominant_emotion, 0.1) * f.confidence
            for f in segment_frames
        ]
        avg_viral = sum(viral_scores) / len(viral_scores)
        
        # Find peak emotional moment
        peak_frame = max(segment_frames, key=lambda f: 
            self.EMOTION_VIRAL_WEIGHTS.get(f.dominant_emotion, 0) * f.confidence
        )
        
        # Generate tags
        emotion_counts: Dict[str, int] = {}
        for f in segment_frames:
            if f.dominant_emotion != "neutral":
                emotion_counts[f.dominant_emotion] = emotion_counts.get(
                    f.dominant_emotion, 0
                ) + 1
        
        # Tags for emotions that appear >20% of the time
        threshold = len(segment_frames) * 0.2
        tags = [
            f"emotion_{emotion}" 
            for emotion, count in emotion_counts.items()
            if count >= threshold
        ]
        
        # Score scaled to 0-15 (to match virality scoring)
        emotion_score = avg_viral * 15
        
        return {
            "emotion_score": emotion_score,
            "emotion_tags": tags,
            "peak_emotion": peak_frame.dominant_emotion,
            "peak_confidence": peak_frame.confidence,
            "peak_time": peak_frame.timestamp
        }


# Convenience functions
def get_emotion_service() -> EmotionDetectionService:
    """Get the emotion detection service instance."""
    return EmotionDetectionService.get_instance()


def is_emotion_detection_available() -> bool:
    """Check if emotion detection is available."""
    return EmotionDetectionService.get_instance().is_available()
