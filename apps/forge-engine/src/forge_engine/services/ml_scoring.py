"""ML-based Trainable Scoring Service."""

import asyncio
import json
import logging
import pickle
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Check for sklearn
try:
    import numpy as np
    from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    logger.info("scikit-learn not available, ML scoring will fall back to heuristics")


@dataclass
class SegmentFeatures:
    """Features extracted from a segment for ML scoring."""
    # Audio features
    audio_energy_mean: float = 0.0
    audio_energy_variance: float = 0.0
    laughter_count: int = 0
    cheer_count: int = 0
    scream_count: int = 0
    silence_ratio: float = 0.0
    audio_event_viral_score: float = 0.0

    # Visual/Emotion features
    face_detection_rate: float = 0.0
    emotion_surprise_score: float = 0.0
    emotion_joy_score: float = 0.0
    emotion_viral_potential: float = 0.0
    scene_change_count: int = 0

    # Transcript features
    word_count: int = 0
    exclamation_count: int = 0
    question_count: int = 0
    hook_patterns_matched: int = 0
    speech_rate: float = 0.0

    # LLM features (if available)
    llm_humor_score: float = 0.0
    llm_surprise_score: float = 0.0
    llm_hook_score: float = 0.0
    llm_clarity_score: float = 0.0
    llm_engagement_score: float = 0.0

    # Timing features
    duration: float = 0.0
    relative_position: float = 0.0  # Position in video (0-1)

    def to_array(self) -> list[float]:
        """Convert to feature array for ML model."""
        return [
            self.audio_energy_mean,
            self.audio_energy_variance,
            float(self.laughter_count),
            float(self.cheer_count),
            float(self.scream_count),
            self.silence_ratio,
            self.audio_event_viral_score,
            self.face_detection_rate,
            self.emotion_surprise_score,
            self.emotion_joy_score,
            self.emotion_viral_potential,
            float(self.scene_change_count),
            float(self.word_count),
            float(self.exclamation_count),
            float(self.question_count),
            float(self.hook_patterns_matched),
            self.speech_rate,
            self.llm_humor_score,
            self.llm_surprise_score,
            self.llm_hook_score,
            self.llm_clarity_score,
            self.llm_engagement_score,
            self.duration,
            self.relative_position,
        ]

    @staticmethod
    def feature_names() -> list[str]:
        """Get feature names for interpretation."""
        return [
            "audio_energy_mean",
            "audio_energy_variance",
            "laughter_count",
            "cheer_count",
            "scream_count",
            "silence_ratio",
            "audio_event_viral_score",
            "face_detection_rate",
            "emotion_surprise_score",
            "emotion_joy_score",
            "emotion_viral_potential",
            "scene_change_count",
            "word_count",
            "exclamation_count",
            "question_count",
            "hook_patterns_matched",
            "speech_rate",
            "llm_humor_score",
            "llm_surprise_score",
            "llm_hook_score",
            "llm_clarity_score",
            "llm_engagement_score",
            "duration",
            "relative_position",
        ]


@dataclass
class TrainingExample:
    """A training example with features and label."""
    segment_id: str
    project_id: str
    features: SegmentFeatures
    label: float  # 0-100 viral score (from user feedback or actual performance)
    feedback_type: str = "user"  # "user", "performance", "heuristic"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class MLModelMetadata:
    """Metadata about a trained ML model."""
    version: int
    training_examples: int
    cv_score: float
    feature_importances: dict[str, float]
    trained_at: str
    model_type: str


class MLScoringService:
    """Service for ML-based trainable scoring."""

    MODEL_DIR = "ml_models"
    MODEL_FILE = "scoring_model.pkl"
    SCALER_FILE = "feature_scaler.pkl"
    TRAINING_DATA_FILE = "training_data.json"
    METADATA_FILE = "model_metadata.json"

    MIN_TRAINING_EXAMPLES = 50  # Minimum examples before training

    _instance: Optional["MLScoringService"] = None

    def __init__(self, library_path: Path):
        self.library_path = library_path
        self.model_dir = library_path / self.MODEL_DIR
        self.model_dir.mkdir(parents=True, exist_ok=True)

        self._model = None
        self._scaler = None
        self._metadata: MLModelMetadata | None = None
        self._training_data: list[TrainingExample] = []

        self._load_model()
        self._load_training_data()

    @classmethod
    def get_instance(cls, library_path: Path | None = None) -> "MLScoringService":
        """Get singleton instance."""
        if cls._instance is None:
            if library_path is None:
                from forge_engine.core.config import settings
                library_path = settings.LIBRARY_PATH
            cls._instance = cls(library_path)
        return cls._instance

    def is_available(self) -> bool:
        """Check if ML scoring is available."""
        return HAS_SKLEARN

    def is_model_trained(self) -> bool:
        """Check if a trained model exists."""
        return self._model is not None

    def get_model_info(self) -> dict[str, Any] | None:
        """Get information about the current model."""
        if self._metadata is None:
            return None

        return {
            "version": self._metadata.version,
            "training_examples": self._metadata.training_examples,
            "cv_score": self._metadata.cv_score,
            "trained_at": self._metadata.trained_at,
            "model_type": self._metadata.model_type,
            "top_features": dict(
                sorted(
                    self._metadata.feature_importances.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:5]
            )
        }

    def extract_features(
        self,
        segment: dict[str, Any],
        audio_data: dict[str, Any] | None = None,
        emotion_data: dict[str, Any] | None = None,
        llm_scores: dict[str, Any] | None = None,
        total_duration: float = 0.0
    ) -> SegmentFeatures:
        """Extract ML features from a segment."""
        features = SegmentFeatures()

        # Timing
        features.duration = segment.get("duration", 0)
        start_time = segment.get("start_time", 0)
        if total_duration > 0:
            features.relative_position = start_time / total_duration

        # Transcript features
        transcript = segment.get("transcript", "")
        features.word_count = len(transcript.split())
        features.exclamation_count = transcript.count("!")
        features.question_count = transcript.count("?")

        # Hook patterns from existing score
        score = segment.get("score", {})
        features.hook_patterns_matched = int(score.get("hook_strength", 0) / 5)

        # Audio features
        if audio_data:
            features.audio_energy_mean = audio_data.get("average_energy", 0)
            features.audio_energy_variance = audio_data.get("energy_variance", 0)

            # Event counts from summary
            summary = audio_data.get("summary", {})
            event_counts = summary.get("event_counts", {})
            features.laughter_count = event_counts.get("laughter", 0)
            features.cheer_count = event_counts.get("cheer", 0) + event_counts.get("applause", 0)
            features.scream_count = event_counts.get("scream", 0) + event_counts.get("gasp", 0)
            features.audio_event_viral_score = summary.get("average_viral_score", 0)

            # Silence ratio
            silences = audio_data.get("silences", [])
            silence_duration = sum(s.get("end", 0) - s.get("start", 0) for s in silences)
            if features.duration > 0:
                features.silence_ratio = silence_duration / features.duration

        # Emotion features
        if emotion_data:
            features.face_detection_rate = emotion_data.get("detection_rate", 0)
            distribution = emotion_data.get("emotion_distribution", {})
            features.emotion_surprise_score = distribution.get("surprise", 0)
            features.emotion_joy_score = distribution.get("happy", 0)
            features.emotion_viral_potential = emotion_data.get("viral_potential_score", 0)

        # Scene changes
        features.scene_change_count = score.get("scene_changes", 0)

        # LLM scores
        if llm_scores:
            features.llm_humor_score = llm_scores.get("humor_score", 0)
            features.llm_surprise_score = llm_scores.get("surprise_score", 0)
            features.llm_hook_score = llm_scores.get("hook_score", 0)
            features.llm_clarity_score = llm_scores.get("clarity_score", 0)
            features.llm_engagement_score = llm_scores.get("engagement_score", 0)
        elif score.get("llm_enhanced"):
            # Extract from existing score if available
            features.llm_engagement_score = score.get("llm_engagement", 0)

        # Speech rate
        if audio_data:
            features.speech_rate = audio_data.get("speech_rate_estimate", 0)
        elif features.duration > 0:
            features.speech_rate = features.word_count / features.duration

        return features

    def predict_score(
        self,
        features: SegmentFeatures
    ) -> tuple[float, dict[str, float]]:
        """
        Predict viral score using ML model.

        Returns:
            Tuple of (predicted_score, feature_contributions)
        """
        if not self.is_model_trained() or not HAS_SKLEARN:
            return 0.0, {}

        import numpy as np

        # Prepare features
        X = np.array([features.to_array()])
        X_scaled = self._scaler.transform(X)

        # Predict
        score = float(self._model.predict(X_scaled)[0])
        score = max(0, min(100, score))

        # Calculate feature contributions (if RandomForest)
        contributions = {}
        if hasattr(self._model, 'feature_importances_'):
            importances = self._model.feature_importances_
            feature_names = SegmentFeatures.feature_names()
            feature_values = features.to_array()

            for name, importance, value in zip(feature_names, importances, feature_values, strict=False):
                contributions[name] = importance * value

        return score, contributions

    async def score_segment_async(
        self,
        segment: dict[str, Any],
        audio_data: dict[str, Any] | None = None,
        emotion_data: dict[str, Any] | None = None,
        llm_scores: dict[str, Any] | None = None,
        total_duration: float = 0.0,
        blend_with_heuristic: bool = True
    ) -> dict[str, Any]:
        """
        Score a segment using ML model with optional heuristic blending.

        Args:
            segment: Segment data
            audio_data: Audio analysis data
            emotion_data: Emotion analysis data
            llm_scores: LLM scoring results
            total_duration: Total video duration
            blend_with_heuristic: Whether to blend ML score with existing heuristic

        Returns:
            Updated score dict
        """
        features = self.extract_features(
            segment, audio_data, emotion_data, llm_scores, total_duration
        )

        ml_score, contributions = self.predict_score(features)

        existing_score = segment.get("score", {})

        if blend_with_heuristic and existing_score:
            # Blend ML score with heuristic (60% ML, 40% heuristic when trained)
            heuristic_score = existing_score.get("total", 50)

            if self._metadata and self._metadata.cv_score > 0.6:
                # Good model - trust ML more
                final_score = ml_score * 0.7 + heuristic_score * 0.3
            else:
                # Weak model - trust heuristic more
                final_score = ml_score * 0.4 + heuristic_score * 0.6
        else:
            final_score = ml_score

        # Update score dict
        new_score = existing_score.copy()
        new_score["total"] = final_score
        new_score["ml_score"] = ml_score
        new_score["ml_enhanced"] = True
        new_score["ml_contributions"] = contributions

        return new_score

    def add_training_example(
        self,
        segment_id: str,
        project_id: str,
        features: SegmentFeatures,
        label: float,
        feedback_type: str = "user"
    ) -> None:
        """Add a training example from user feedback."""
        example = TrainingExample(
            segment_id=segment_id,
            project_id=project_id,
            features=features,
            label=label,
            feedback_type=feedback_type
        )
        self._training_data.append(example)
        self._save_training_data()

        logger.info(f"Added training example: {segment_id} with label {label}")

    def add_feedback(
        self,
        segment: dict[str, Any],
        rating: float,
        audio_data: dict[str, Any] | None = None,
        emotion_data: dict[str, Any] | None = None,
        total_duration: float = 0.0
    ) -> None:
        """Add user feedback for a segment."""
        features = self.extract_features(
            segment, audio_data, emotion_data, None, total_duration
        )

        self.add_training_example(
            segment_id=segment.get("id", "unknown"),
            project_id=segment.get("project_id", "unknown"),
            features=features,
            label=rating * 10,  # Convert 0-10 rating to 0-100 score
            feedback_type="user"
        )

    def get_training_data_count(self) -> int:
        """Get number of training examples."""
        return len(self._training_data)

    def can_train(self) -> bool:
        """Check if there's enough data to train."""
        return len(self._training_data) >= self.MIN_TRAINING_EXAMPLES and HAS_SKLEARN

    async def train_model(
        self,
        force: bool = False
    ) -> MLModelMetadata | None:
        """
        Train the ML model on collected data.

        Args:
            force: Train even if minimum examples not met

        Returns:
            Model metadata if successful
        """
        if not HAS_SKLEARN:
            logger.error("scikit-learn not available for training")
            return None

        if not force and not self.can_train():
            logger.warning(
                f"Not enough training data: {len(self._training_data)} < {self.MIN_TRAINING_EXAMPLES}"
            )
            return None

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._train_sync)

    def _train_sync(self) -> MLModelMetadata | None:
        """Synchronous model training."""
        import numpy as np

        # Prepare data
        X = np.array([ex.features.to_array() for ex in self._training_data])
        y = np.array([ex.label for ex in self._training_data])

        # Scale features
        self._scaler = StandardScaler()
        X_scaled = self._scaler.fit_transform(X)

        # Train model (Gradient Boosting for better performance)
        self._model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )

        # Cross-validation score
        cv_scores = cross_val_score(self._model, X_scaled, y, cv=5, scoring='r2')
        cv_score = float(np.mean(cv_scores))

        # Train final model
        self._model.fit(X_scaled, y)

        # Get feature importances
        feature_names = SegmentFeatures.feature_names()
        importances = dict(zip(feature_names, self._model.feature_importances_, strict=False))

        # Create metadata
        version = 1
        if self._metadata:
            version = self._metadata.version + 1

        self._metadata = MLModelMetadata(
            version=version,
            training_examples=len(self._training_data),
            cv_score=cv_score,
            feature_importances=importances,
            trained_at=datetime.now().isoformat(),
            model_type="GradientBoostingRegressor"
        )

        # Save model
        self._save_model()

        logger.info(f"Trained ML model v{version} with CV score: {cv_score:.3f}")

        return self._metadata

    def _save_model(self) -> None:
        """Save model to disk."""
        if self._model is None:
            return

        model_path = self.model_dir / self.MODEL_FILE
        scaler_path = self.model_dir / self.SCALER_FILE
        metadata_path = self.model_dir / self.METADATA_FILE

        with open(model_path, 'wb') as f:
            pickle.dump(self._model, f)

        with open(scaler_path, 'wb') as f:
            pickle.dump(self._scaler, f)

        if self._metadata:
            with open(metadata_path, 'w') as f:
                json.dump({
                    "version": self._metadata.version,
                    "training_examples": self._metadata.training_examples,
                    "cv_score": self._metadata.cv_score,
                    "feature_importances": self._metadata.feature_importances,
                    "trained_at": self._metadata.trained_at,
                    "model_type": self._metadata.model_type,
                }, f, indent=2)

        logger.info(f"Saved ML model to {model_path}")

    def _load_model(self) -> None:
        """Load model from disk."""
        model_path = self.model_dir / self.MODEL_FILE
        scaler_path = self.model_dir / self.SCALER_FILE
        metadata_path = self.model_dir / self.METADATA_FILE

        if not model_path.exists() or not HAS_SKLEARN:
            return

        try:
            with open(model_path, 'rb') as f:
                self._model = pickle.load(f)

            with open(scaler_path, 'rb') as f:
                self._scaler = pickle.load(f)

            if metadata_path.exists():
                with open(metadata_path) as f:
                    data = json.load(f)
                    self._metadata = MLModelMetadata(**data)

            logger.info(f"Loaded ML model v{self._metadata.version if self._metadata else '?'}")
        except Exception as e:
            logger.error(f"Failed to load ML model: {e}")
            self._model = None
            self._scaler = None

    def _save_training_data(self) -> None:
        """Save training data to disk."""
        data_path = self.model_dir / self.TRAINING_DATA_FILE

        data = [
            {
                "segment_id": ex.segment_id,
                "project_id": ex.project_id,
                "features": ex.features.to_array(),
                "label": ex.label,
                "feedback_type": ex.feedback_type,
                "created_at": ex.created_at,
            }
            for ex in self._training_data
        ]

        with open(data_path, 'w') as f:
            json.dump(data, f)

    def _load_training_data(self) -> None:
        """Load training data from disk."""
        data_path = self.model_dir / self.TRAINING_DATA_FILE

        if not data_path.exists():
            return

        try:
            with open(data_path) as f:
                data = json.load(f)

            feature_names = SegmentFeatures.feature_names()

            for item in data:
                features = SegmentFeatures()
                feature_values = item.get("features", [])
                for i, name in enumerate(feature_names):
                    if i < len(feature_values):
                        setattr(features, name, feature_values[i])

                example = TrainingExample(
                    segment_id=item["segment_id"],
                    project_id=item["project_id"],
                    features=features,
                    label=item["label"],
                    feedback_type=item.get("feedback_type", "user"),
                    created_at=item.get("created_at", "")
                )
                self._training_data.append(example)

            logger.info(f"Loaded {len(self._training_data)} training examples")
        except Exception as e:
            logger.error(f"Failed to load training data: {e}")


# Convenience functions
def get_ml_scoring_service(library_path: Path | None = None) -> MLScoringService:
    """Get the ML scoring service instance."""
    return MLScoringService.get_instance(library_path)


def is_ml_scoring_available() -> bool:
    """Check if ML scoring is available."""
    return HAS_SKLEARN
