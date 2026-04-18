"""Virality Predictor - ML model to predict clip viral potential."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
    factors: Dict[str, float]  # Feature contributions
    recommendations: List[str]
    estimated_views_range: Tuple[int, int]  # (min, max) estimated views
    platform_scores: Dict[str, float]  # Score by platform


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
    
    def to_array(self) -> List[float]:
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
    
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path
        self._model = None
        self._scaler = None
        self._is_trained = False
    
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
    
    def _calculate_factors(self, features: ViralityFeatures) -> Dict[str, float]:
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
    
    def _generate_recommendations(self, features: ViralityFeatures) -> List[str]:
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
    
    def _estimate_views(self, score: float) -> Tuple[int, int]:
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
    ) -> Dict[str, float]:
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
    
    async def extract_features(
        self,
        segment: Dict[str, Any],
        audio_data: Optional[Dict[str, Any]] = None,
        emotion_data: Optional[Dict[str, Any]] = None,
        llm_scores: Optional[Dict[str, Any]] = None,
        export_config: Optional[Dict[str, Any]] = None
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
