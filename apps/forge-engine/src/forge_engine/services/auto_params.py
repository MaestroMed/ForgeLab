"""
Auto Parameters Service - WORLD CLASS automatic detection of optimal export settings.

This service analyzes content and recommends the best style and settings for viral potential.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# TikTok safe zones (in pixels, based on 1080x1920)
TIKTOK_SAFE_ZONES = {
    "top_margin": 150,      # For profile/username
    "bottom_margin": 250,   # For buttons/comments
    "side_margin": 40,      # For edge safety
}

# Font size recommendations (% of screen height) - WORLD CLASS standards
FONT_SIZE_RULES = {
    "min_percent": 0.045,   # ~86px minimum (raised for mobile visibility)
    "max_percent": 0.060,   # ~115px maximum  
    "optimal_percent": 0.050,  # ~96px sweet spot (VIRAL PRO standard)
}

# Content type indicators based on segment tags
CONTENT_TYPE_INDICATORS = {
    "gaming": ["gaming", "clutch", "fail", "win", "play", "game"],
    "reaction": ["reaction", "surprise", "shock", "wow", "omg", "humour", "lol"],
    "talking_head": ["debate", "discussion", "explanation", "story", "advice"],
    "comedy": ["funny", "comedy", "joke", "humor", "lol", "mdr"],
    "drama": ["rage", "drama", "rant", "angry", "conflict"],
    "educational": ["tutorial", "how-to", "tip", "learn", "explain"],
}

# Style recommendations based on content type and score
STYLE_RECOMMENDATIONS = {
    "gaming": {"high_score": "viral_pro", "low_score": "impact"},
    "reaction": {"high_score": "viral_pro", "low_score": "viral"},
    "talking_head": {"high_score": "viral_pro", "low_score": "clean"},
    "comedy": {"high_score": "impact", "low_score": "viral"},
    "drama": {"high_score": "impact", "low_score": "viral_pro"},
    "educational": {"high_score": "clean", "low_score": "clean"},
    "default": {"high_score": "viral_pro", "low_score": "viral_pro"},  # WORLD CLASS default
}


class AutoParamsService:
    """
    WORLD CLASS Auto Parameters Service.
    
    Automatically detects optimal export settings for maximum viral potential:
    - Style recommendation based on content type and virality score
    - Safe zone calculation for subtitle positioning
    - Font size optimization for mobile readability
    """
    
    def __init__(self, width: int = 1080, height: int = 1920):
        self.width = width
        self.height = height
    
    async def compute_optimal_params(
        self,
        layout_info: Optional[Dict[str, Any]] = None,
        content_type: Optional[str] = None,  # "gaming", "talking_head", "vlog", etc.
        segment_score: Optional[float] = None,
        segment_tags: Optional[List[str]] = None,  # Tags from viral scoring
    ) -> Dict[str, Any]:
        """
        Compute WORLD CLASS optimal export parameters.
        
        Args:
            layout_info: Layout detection results (facecam position, content zones)
            content_type: Type of content detected (will auto-detect if not provided)
            segment_score: Virality score of the segment
            segment_tags: Tags from the viral scoring (e.g., ["humour", "surprise"])
            
        Returns:
            Dict with optimal parameters for export
        """
        # Auto-detect content type from tags if not provided
        if not content_type and segment_tags:
            content_type = self._detect_content_type(segment_tags)
        
        params = {
            "subtitle_style": "viral_pro",  # WORLD CLASS default
            "subtitle_position": "center",  # Center is optimal for engagement
            "subtitle_position_y": int(self.height * 0.5),  # True center
            "subtitle_font_size": self._compute_optimal_font_size(),
            "facecam_zone": None,
            "content_zone": None,
            "recommended_crop": None,
            "detected_content_type": content_type,
            "animation_type": "pop_scale",  # Default animation
        }
        
        if not layout_info:
            # No layout info - use WORLD CLASS defaults
            logger.info(f"[AutoParams] No layout info, using VIRAL PRO defaults")
            params["subtitle_style"] = self._recommend_style(content_type, segment_score)
            return params
        
        # Extract facecam position
        facecam_position = self._detect_facecam_zone(layout_info)
        params["facecam_zone"] = facecam_position
        
        # Compute safe subtitle position avoiding facecam
        subtitle_pos, position_y = self._compute_subtitle_position(facecam_position)
        params["subtitle_position"] = subtitle_pos
        params["subtitle_position_y"] = position_y
        
        # Recommend style based on content
        params["subtitle_style"] = self._recommend_style(content_type, segment_score)
        
        # Recommend animation based on content type
        params["animation_type"] = self._recommend_animation(content_type, segment_score)
        
        # Extract content zone
        content_zone = layout_info.get("content_zone") or layout_info.get("game_zone")
        if content_zone:
            params["content_zone"] = content_zone
        
        logger.info(f"[AutoParams] WORLD CLASS params: style={params['subtitle_style']}, position={subtitle_pos}, animation={params['animation_type']}")
        
        return params
    
    def _detect_content_type(self, tags: List[str]) -> Optional[str]:
        """Auto-detect content type from segment tags."""
        if not tags:
            return None
        
        tags_lower = [t.lower() for t in tags]
        
        # Score each content type by matching tags
        scores = {}
        for content_type, indicators in CONTENT_TYPE_INDICATORS.items():
            score = sum(1 for tag in tags_lower if any(ind in tag for ind in indicators))
            if score > 0:
                scores[content_type] = score
        
        if not scores:
            return None
        
        # Return content type with highest score
        best_type = max(scores, key=scores.get)
        logger.debug(f"[AutoParams] Detected content type: {best_type} (scores: {scores})")
        return best_type
    
    def _recommend_animation(
        self, 
        content_type: Optional[str],
        segment_score: Optional[float]
    ) -> str:
        """Recommend animation type based on content."""
        # High energy content = bounce or pop
        if content_type in ["gaming", "reaction", "comedy"]:
            return "pop_scale"  # Energetic pop
        elif content_type in ["drama", "debate"]:
            return "glow"  # Dramatic glow
        elif content_type in ["talking_head", "educational"]:
            return "fade"  # Clean and professional
        
        # High score = more dynamic animation
        if segment_score and segment_score >= 80:
            return "pop_scale"
        
        return "pop_scale"  # WORLD CLASS default
    
    def _detect_facecam_zone(self, layout_info: Dict[str, Any]) -> Optional[str]:
        """Detect facecam position from layout info."""
        # Check various layout detection formats
        facecam = layout_info.get("facecam") or layout_info.get("face_zone")
        
        if not facecam:
            # Check for face detection results
            faces = layout_info.get("faces", [])
            if faces:
                # Use first detected face
                face = faces[0] if isinstance(faces, list) else faces
                x = face.get("x", 0) or face.get("center_x", 0)
                y = face.get("y", 0) or face.get("center_y", 0)
                
                # Determine zone based on position
                return self._position_to_zone(x, y)
            return None
        
        # Handle dict format
        if isinstance(facecam, dict):
            x = facecam.get("x", 0) or facecam.get("center_x", 0)
            y = facecam.get("y", 0) or facecam.get("center_y", 0)
            return self._position_to_zone(x, y)
        
        # Handle string format (e.g., "top-left")
        if isinstance(facecam, str):
            return facecam
        
        return None
    
    def _position_to_zone(self, x: float, y: float) -> str:
        """Convert x,y coordinates to zone string."""
        # Normalize to 0-1 range if in pixels
        if x > 1:
            x = x / self.width
        if y > 1:
            y = y / self.height
        
        # Determine horizontal position
        if x < 0.33:
            h_pos = "left"
        elif x > 0.66:
            h_pos = "right"
        else:
            h_pos = "center"
        
        # Determine vertical position
        if y < 0.33:
            v_pos = "top"
        elif y > 0.66:
            v_pos = "bottom"
        else:
            v_pos = "middle"
        
        return f"{v_pos}-{h_pos}"
    
    def _compute_subtitle_position(
        self, 
        facecam_position: Optional[str]
    ) -> Tuple[str, Optional[int]]:
        """
        Compute safe subtitle position avoiding facecam overlap.
        
        Returns:
            Tuple of (position_name, position_y_pixels)
        """
        # Default safe bottom position
        safe_bottom_y = self.height - TIKTOK_SAFE_ZONES["bottom_margin"] - 100  # ~1570
        safe_center_y = int(self.height * 0.45)  # ~864
        safe_top_y = TIKTOK_SAFE_ZONES["top_margin"] + 100  # ~250
        
        if not facecam_position:
            # No facecam - use bottom
            return ("bottom", safe_bottom_y)
        
        facecam_position = facecam_position.lower()
        
        # Avoid overlap based on facecam position
        if "top" in facecam_position:
            # Facecam at top - subtitles at bottom
            return ("bottom", safe_bottom_y)
        elif "bottom" in facecam_position:
            # Facecam at bottom - subtitles at center
            return ("center", safe_center_y)
        elif "middle" in facecam_position or "center" in facecam_position:
            # Facecam in middle - subtitles at bottom (safest)
            return ("bottom", safe_bottom_y)
        else:
            # Side facecam - bottom is usually safe
            return ("bottom", safe_bottom_y)
    
    def _compute_optimal_font_size(self) -> int:
        """Compute optimal font size for TikTok readability."""
        return int(self.height * FONT_SIZE_RULES["optimal_percent"])
    
    def _recommend_style(
        self, 
        content_type: Optional[str],
        segment_score: Optional[float]
    ) -> str:
        """
        WORLD CLASS style recommendation.
        
        Uses viral_pro as the default for maximum engagement.
        Falls back to content-specific styles when appropriate.
        """
        is_high_score = segment_score and segment_score >= 70
        
        # Get recommendation map for content type
        content_key = content_type.lower() if content_type else "default"
        recommendations = STYLE_RECOMMENDATIONS.get(content_key, STYLE_RECOMMENDATIONS["default"])
        
        if is_high_score:
            return recommendations["high_score"]
        else:
            return recommendations["low_score"]
    
    def get_style_for_platform(self, platform: str = "tiktok") -> Dict[str, Any]:
        """Get recommended style settings for a specific platform."""
        platform = platform.lower()
        
        if platform == "tiktok":
            return {
                "recommended_style": "viral",
                "font_size_range": (62, 86),
                "safe_zones": TIKTOK_SAFE_ZONES,
                "aspect_ratio": "9:16",
            }
        elif platform == "youtube_shorts":
            return {
                "recommended_style": "clean",
                "font_size_range": (56, 80),
                "safe_zones": {
                    "top_margin": 100,
                    "bottom_margin": 200,
                    "side_margin": 30,
                },
                "aspect_ratio": "9:16",
            }
        elif platform == "instagram":
            return {
                "recommended_style": "impact",
                "font_size_range": (58, 82),
                "safe_zones": {
                    "top_margin": 120,
                    "bottom_margin": 180,
                    "side_margin": 35,
                },
                "aspect_ratio": "9:16",
            }
        else:
            # Default
            return {
                "recommended_style": "clean",
                "font_size_range": (56, 80),
                "safe_zones": TIKTOK_SAFE_ZONES,
                "aspect_ratio": "9:16",
            }


# Singleton instance
_instance: Optional[AutoParamsService] = None

def get_auto_params_service() -> AutoParamsService:
    """Get singleton instance of AutoParamsService."""
    global _instance
    if _instance is None:
        _instance = AutoParamsService()
    return _instance
