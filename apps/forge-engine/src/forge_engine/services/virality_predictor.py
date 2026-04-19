"""Virality Predictor - ML model to predict clip viral potential."""

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

# Check for ML libraries
try:
    import numpy as np
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.preprocessing import StandardScaler
    HAS_ML = True
except ImportError:
    HAS_ML = False


@dataclass
class ViralityPrediction:
    """Prediction result for a clip."""
    predicted_score: float  # 0-100
    confidence: float  # 0-1
    factors: dict[str, float]  # Feature contributions
    recommendations: list[str]
    estimated_views_range: tuple[int, int]  # (min, max) estimated views
    platform_scores: dict[str, float]  # Score by platform


@dataclass
class ViralityFeatures:
    """Features for virality prediction."""
    # Content features
    hook_strength: float = 0.0
    humor_score: float = 0.0
    surprise_score: float = 0.0
    clarity_score: float = 0.0

    # Technical features
    duration: float = 60.0
    has_subtitles: bool = True
    has_music: bool = False
    has_intro: bool = False

    # Engagement signals
    audio_energy: float = 0.5
    scene_changes: int = 5
    face_visible_percent: float = 0.5
    emotion_variance: float = 0.3

    # Content type
    is_gaming: bool = False
    is_reaction: bool = False
    is_tutorial: bool = False
    is_comedy: bool = False

    def to_array(self) -> list[float]:
        """Convert to feature array."""
        return [
            self.hook_strength,
            self.humor_score,
            self.surprise_score,
            self.clarity_score,
            self.duration / 180,  # Normalize to ~1
            float(self.has_subtitles),
            float(self.has_music),
            float(self.has_intro),
            self.audio_energy,
            self.scene_changes / 20,  # Normalize
            self.face_visible_percent,
            self.emotion_variance,
            float(self.is_gaming),
            float(self.is_reaction),
            float(self.is_tutorial),
            float(self.is_comedy),
        ]


class ViralityPredictor:
    """
    Predicts viral potential of clips using ML.

    Can be trained on historical data with actual performance metrics.
    """

    # Platform-specific view multipliers
    PLATFORM_MULTIPLIERS = {
        "tiktok": {"base_views": 1000, "viral_multiplier": 100},
        "youtube": {"base_views": 500, "viral_multiplier": 50},
        "instagram": {"base_views": 800, "viral_multiplier": 80},
    }

    # Optimal ranges for virality
    OPTIMAL_RANGES = {
        "duration": (45, 90),  # Sweet spot for TikTok
        "hook_strength": (0.6, 1.0),
        "audio_energy": (0.5, 0.8),
        "scene_changes": (3, 15),
    }

    _instance: Optional["ViralityPredictor"] = None

    def __init__(self, model_path: Path | None = None):
        self.model_path = model_path
        self._model = None
        self._scaler = None
        self._is_trained = False
        self._performance_data: list[dict] = []
        self._performance_file = settings.TEMP_PATH / "virality_performance.json"
        self._load_performance_data()

    @classmethod
    def get_instance(cls) -> "ViralityPredictor":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_available(self) -> bool:
        """Check if predictor is available."""
        return HAS_ML

    async def predict(
        self,
        features: ViralityFeatures
    ) -> ViralityPrediction:
        """
        Predict virality of a clip.

        Args:
            features: Extracted features

        Returns:
            ViralityPrediction with score and recommendations
        """
        if not HAS_ML:
            return self._heuristic_predict(features)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self._predict_sync(features))

    def _predict_sync(self, features: ViralityFeatures) -> ViralityPrediction:
        """Synchronous prediction."""
        if self._model is not None and self._is_trained:
            # Use trained model
            X = np.array([features.to_array()])
            X_scaled = self._scaler.transform(X)
            score = float(self._model.predict(X_scaled)[0])
            confidence = 0.8
        else:
            # Use heuristic model
            return self._heuristic_predict(features)

        # Clamp score
        score = max(0, min(100, score))

        # Calculate factor contributions
        factors = self._calculate_factors(features)

        # Generate recommendations
        recommendations = self._generate_recommendations(features)

        # Estimate views
        views_range = self._estimate_views(score)

        # Platform-specific scores
        platform_scores = self._calculate_platform_scores(features, score)

        return ViralityPrediction(
            predicted_score=score,
            confidence=confidence,
            factors=factors,
            recommendations=recommendations,
            estimated_views_range=views_range,
            platform_scores=platform_scores
        )

    def _heuristic_predict(self, features: ViralityFeatures) -> ViralityPrediction:
        """Heuristic prediction when ML model not available."""
        # Base score from key features
        score = 0

        # Hook strength (25 points max)
        score += features.hook_strength * 25

        # Humor (20 points max)
        score += features.humor_score * 20

        # Surprise (15 points max)
        score += features.surprise_score * 15

        # Clarity (15 points max)
        score += features.clarity_score * 15

        # Duration bonus (10 points max)
        if 45 <= features.duration <= 90:
            score += 10
        elif 30 <= features.duration <= 120:
            score += 5

        # Production quality (15 points max)
        if features.has_subtitles:
            score += 5
        if features.has_music:
            score += 5
        if features.has_intro:
            score += 5

        # Engagement signals
        score += features.audio_energy * 5
        score += min(features.scene_changes / 20, 1) * 5

        # Clamp
        score = max(0, min(100, score))

        factors = self._calculate_factors(features)
        recommendations = self._generate_recommendations(features)
        views_range = self._estimate_views(score)
        platform_scores = self._calculate_platform_scores(features, score)

        return ViralityPrediction(
            predicted_score=score,
            confidence=0.5,  # Lower confidence for heuristic
            factors=factors,
            recommendations=recommendations,
            estimated_views_range=views_range,
            platform_scores=platform_scores
        )

    def _calculate_factors(self, features: ViralityFeatures) -> dict[str, float]:
        """Calculate contribution of each factor."""
        return {
            "hook_strength": features.hook_strength * 25,
            "humor": features.humor_score * 20,
            "surprise": features.surprise_score * 15,
            "clarity": features.clarity_score * 15,
            "duration_fit": 10 if 45 <= features.duration <= 90 else 5,
            "production_quality": (
                (5 if features.has_subtitles else 0) +
                (5 if features.has_music else 0) +
                (5 if features.has_intro else 0)
            ),
        }

    def _generate_recommendations(self, features: ViralityFeatures) -> list[str]:
        """Generate improvement recommendations."""
        recommendations = []

        if features.hook_strength < 0.6:
            recommendations.append("Améliore l'accroche: commence par le moment le plus impactant")

        if features.duration < 45:
            recommendations.append("La vidéo est courte: ajoute du contexte pour retenir l'attention")
        elif features.duration > 120:
            recommendations.append("La vidéo est longue: coupe les parties moins engageantes")

        if not features.has_subtitles:
            recommendations.append("Ajoute des sous-titres: 85% des vidéos sont regardées sans son")

        if not features.has_music:
            recommendations.append("Ajoute de la musique de fond pour plus d'énergie")

        if features.audio_energy < 0.4:
            recommendations.append("L'énergie audio est basse: choisis un moment plus dynamique")

        if features.face_visible_percent < 0.3:
            recommendations.append("Le visage est peu visible: les réactions créent de la connexion")

        if features.scene_changes < 3:
            recommendations.append("Peu de changements: ajoute du dynamisme avec des coupes")

        return recommendations[:5]  # Top 5 recommendations

    def _estimate_views(self, score: float) -> tuple[int, int]:
        """Estimate view range based on score."""
        # Very rough estimates based on score tiers
        if score >= 80:
            return (10000, 100000)
        elif score >= 60:
            return (1000, 10000)
        elif score >= 40:
            return (100, 1000)
        else:
            return (10, 100)

    def _calculate_platform_scores(
        self,
        features: ViralityFeatures,
        base_score: float
    ) -> dict[str, float]:
        """Calculate platform-specific scores."""
        scores = {}

        # TikTok: Prefers shorter, high-energy content
        tiktok_modifier = 1.0
        if 45 <= features.duration <= 60:
            tiktok_modifier += 0.1
        if features.audio_energy > 0.6:
            tiktok_modifier += 0.1
        scores["tiktok"] = min(100, base_score * tiktok_modifier)

        # YouTube: Prefers slightly longer, informative content
        youtube_modifier = 1.0
        if 60 <= features.duration <= 120:
            youtube_modifier += 0.1
        if features.clarity_score > 0.7:
            youtube_modifier += 0.05
        scores["youtube"] = min(100, base_score * youtube_modifier)

        # Instagram: Similar to TikTok but values aesthetics
        instagram_modifier = 1.0
        if 30 <= features.duration <= 60:
            instagram_modifier += 0.1
        if features.has_music:
            instagram_modifier += 0.05
        scores["instagram"] = min(100, base_score * instagram_modifier)

        return scores

    def _load_performance_data(self) -> None:
        """Load historical performance data from disk."""
        try:
            if self._performance_file.exists():
                with open(self._performance_file) as f:
                    self._performance_data = json.load(f)
                logger.info("Loaded %d performance records", len(self._performance_data))
        except Exception as e:
            logger.warning("Failed to load performance data: %s", e)
            self._performance_data = []

    async def record_performance(
        self,
        segment_id: str,
        predicted_score: float,
        platform: str,
        views: int,
        likes: int = 0,
        completion_rate: float = 0.0,
        features: "ViralityFeatures | None" = None,
    ) -> None:
        """Record real performance data for a published clip."""
        record = {
            "segment_id": segment_id,
            "predicted_score": predicted_score,
            "platform": platform,
            "views": views,
            "likes": likes,
            "completion_rate": completion_rate,
            "actual_score": self._compute_actual_score(views, likes, completion_rate, platform),
            "timestamp": __import__("time").time(),
            "features": features.to_array() if features else None,
        }
        self._performance_data.append(record)

        # Persist
        try:
            self._performance_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._performance_file, "w") as f:
                json.dump(self._performance_data, f)
        except Exception as e:
            logger.warning("Failed to save performance data: %s", e)

        # Auto-retrain if enough new data (every 20 new records)
        if HAS_ML and len(self._performance_data) >= 20 and len(self._performance_data) % 20 == 0:
            await self.retrain()

    def _compute_actual_score(
        self, views: int, likes: int, completion_rate: float, platform: str
    ) -> float:
        """Compute a normalized actual virality score from real metrics."""
        config = self.PLATFORM_MULTIPLIERS.get(platform, self.PLATFORM_MULTIPLIERS["tiktok"])
        base = config["base_views"]
        viral = config["viral_multiplier"]

        # Normalize views: log scale capped at 100
        import math
        views_score = min(100, math.log10(max(1, views)) / math.log10(base * viral) * 100)

        # Likes ratio (0-100)
        like_ratio = (likes / max(1, views)) * 100 if views > 0 else 0
        likes_score = min(100, like_ratio * 20)

        # Completion rate is 0-1
        completion_score = completion_rate * 100

        return views_score * 0.5 + likes_score * 0.3 + completion_score * 0.2

    async def retrain(self) -> bool:
        """Retrain the model on accumulated performance data."""
        if not HAS_ML or len(self._performance_data) < 10:
            return False

        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._retrain_sync)

    def _retrain_sync(self) -> bool:
        """Synchronous retraining."""
        try:
            records = [r for r in self._performance_data if r.get("features") is not None]
            if len(records) < 10:
                return False

            X = np.array([r["features"] for r in records])
            y = np.array([r["actual_score"] for r in records])

            if self._scaler is None:
                from sklearn.preprocessing import StandardScaler
                self._scaler = StandardScaler()
            X_scaled = self._scaler.fit_transform(X)

            if self._model is None:
                from sklearn.ensemble import GradientBoostingRegressor
                self._model = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
            self._model.fit(X_scaled, y)
            self._is_trained = True

            logger.info("Virality model retrained on %d samples", len(records))
            return True
        except Exception as e:
            logger.error("Retraining failed: %s", e)
            return False

    def get_similar_clips_stats(
        self, predicted_score: float, platform: str, tolerance: float = 15.0
    ) -> dict:
        """Get stats from similar clips (for 'clips similaires ont généré X vues' UI)."""
        similar = [
            r for r in self._performance_data
            if r.get("platform") == platform
            and abs(r.get("predicted_score", 0) - predicted_score) <= tolerance
            and r.get("views", 0) > 0
        ]
        if not similar:
            return {"count": 0, "avg_views": 0, "avg_likes": 0, "avg_completion": 0}

        avg_views = int(sum(r["views"] for r in similar) / len(similar))
        avg_likes = int(sum(r.get("likes", 0) for r in similar) / len(similar))
        avg_completion = sum(r.get("completion_rate", 0) for r in similar) / len(similar)
        return {
            "count": len(similar),
            "avg_views": avg_views,
            "avg_likes": avg_likes,
            "avg_completion": round(avg_completion, 2),
        }

    async def extract_features(
        self,
        segment: dict[str, Any],
        audio_data: dict[str, Any] | None = None,
        emotion_data: dict[str, Any] | None = None,
        llm_scores: dict[str, Any] | None = None,
        export_config: dict[str, Any] | None = None
    ) -> ViralityFeatures:
        """
        Extract features from segment and analysis data.

        Args:
            segment: Segment data with score and transcript
            audio_data: Audio analysis results
            emotion_data: Emotion analysis results
            llm_scores: LLM scoring results
            export_config: Export configuration (subtitles, music, etc.)

        Returns:
            ViralityFeatures for prediction
        """
        features = ViralityFeatures()

        score_data = segment.get("score", {})

        # Content features from score
        features.hook_strength = score_data.get("hook_strength", 0) / 25
        features.humor_score = score_data.get("humour_reaction", 0) / 15
        features.clarity_score = score_data.get("clarity_autonomy", 0) / 15

        # LLM scores if available
        if llm_scores:
            features.surprise_score = llm_scores.get("surprise_score", 5) / 10
            if llm_scores.get("humor_score", 0) > features.humor_score * 10:
                features.humor_score = llm_scores["humor_score"] / 10

        # Technical features
        features.duration = segment.get("duration", 60)

        if export_config:
            features.has_subtitles = export_config.get("subtitles", {}).get("enabled", False)
            features.has_music = export_config.get("music", {}).get("enabled", False)
            features.has_intro = export_config.get("intro", {}).get("enabled", False)

        # Audio features
        if audio_data:
            features.audio_energy = audio_data.get("average_energy", 0.5)
            features.scene_changes = len(audio_data.get("peaks", []))

        # Emotion features
        if emotion_data:
            features.face_visible_percent = emotion_data.get("detection_rate", 0.5)
            distribution = emotion_data.get("emotion_distribution", {})
            features.emotion_variance = np.std(list(distribution.values())) if distribution else 0.3

        # Content type from tags
        tags = score_data.get("tags", [])
        tags_str = " ".join(tags).lower()

        features.is_gaming = any(t in tags_str for t in ["gaming", "game", "lol", "esport"])
        features.is_reaction = any(t in tags_str for t in ["reaction", "surprise", "rage"])
        features.is_comedy = any(t in tags_str for t in ["humour", "funny", "comedy", "lol"])

        return features


# Convenience functions
def get_virality_predictor() -> ViralityPredictor:
    """Get the virality predictor instance."""
    return ViralityPredictor.get_instance()
