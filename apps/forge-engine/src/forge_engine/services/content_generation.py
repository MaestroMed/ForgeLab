"""Content Generation Service for viral titles, descriptions, and hashtags."""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class GeneratedContent:
    """Generated content for a clip."""
    titles: List[str]
    description: str
    hashtags: List[str]
    hook_suggestion: Optional[str] = None
    emoji_suggestions: List[str] = field(default_factory=list)
    platform_specific: Dict[str, Dict[str, Any]] = field(default_factory=dict)


class ContentGenerationService:
    """Service for generating viral content (titles, descriptions, hashtags)."""
    
    # Platform-specific configurations
    PLATFORM_CONFIG = {
        "tiktok": {
            "max_title_length": 100,
            "max_description_length": 150,
            "hashtag_count": 5,
            "emoji_heavy": True,
            "trending_hashtags": ["#fyp", "#foryou", "#viral", "#pourtoi", "#foryoupage"]
        },
        "youtube": {
            "max_title_length": 60,
            "max_description_length": 200,
            "hashtag_count": 3,
            "emoji_heavy": False,
            "trending_hashtags": ["#shorts", "#gaming", "#viral"]
        },
        "instagram": {
            "max_title_length": 100,
            "max_description_length": 300,
            "hashtag_count": 10,
            "emoji_heavy": True,
            "trending_hashtags": ["#reels", "#viral", "#explore", "#trending"]
        }
    }
    
    # Common viral emojis
    VIRAL_EMOJIS = ["🔥", "😱", "💀", "😂", "🤯", "👀", "💪", "🎮", "🏆", "⚡", "🚀", "😤"]
    
    _instance: Optional["ContentGenerationService"] = None
    
    def __init__(self):
        self._llm_service = None
        self._llm_available = None
    
    @classmethod
    def get_instance(cls) -> "ContentGenerationService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def _get_llm_service(self):
        """Get LLM service if available."""
        if self._llm_service is None:
            try:
                from forge_engine.services.llm_local import LocalLLMService
                self._llm_service = LocalLLMService.get_instance()
                self._llm_available = await self._llm_service.check_availability()
            except Exception as e:
                logger.warning(f"LLM service not available: {e}")
                self._llm_available = False
        
        return self._llm_service if self._llm_available else None
    
    async def generate_content(
        self,
        transcript: str,
        segment_tags: List[str],
        platform: str = "tiktok",
        score_data: Optional[Dict[str, Any]] = None,
        channel_name: Optional[str] = None
    ) -> GeneratedContent:
        """
        Generate viral content for a clip.
        
        Args:
            transcript: The clip transcript
            segment_tags: Tags identified for the segment
            platform: Target platform (tiktok, youtube, instagram)
            score_data: Scoring data for context
            channel_name: Creator/channel name for branding
        
        Returns:
            GeneratedContent with titles, description, hashtags
        """
        # Try LLM-based generation first
        llm = await self._get_llm_service()
        if llm:
            try:
                result = await llm.generate_content(
                    transcript=transcript,
                    segment_tags=segment_tags,
                    platform=platform
                )
                if result:
                    # Enhance with platform-specific content
                    return self._enhance_generated_content(
                        result, platform, segment_tags, channel_name
                    )
            except Exception as e:
                logger.warning(f"LLM content generation failed: {e}")
        
        # Fall back to heuristic generation
        return self._generate_heuristic(
            transcript, segment_tags, platform, score_data, channel_name
        )
    
    def _enhance_generated_content(
        self,
        llm_result,
        platform: str,
        segment_tags: List[str],
        channel_name: Optional[str]
    ) -> GeneratedContent:
        """Enhance LLM-generated content with platform-specific elements."""
        config = self.PLATFORM_CONFIG.get(platform, self.PLATFORM_CONFIG["tiktok"])
        
        # Truncate titles if needed
        titles = [
            title[:config["max_title_length"]] 
            for title in llm_result.titles[:5]
        ]
        
        # Add emojis to titles if platform supports it
        if config["emoji_heavy"] and titles:
            titles = self._add_emojis_to_titles(titles, segment_tags)
        
        # Truncate description
        description = llm_result.description[:config["max_description_length"]]
        
        # Combine hashtags with trending ones
        hashtags = list(set(llm_result.hashtags[:config["hashtag_count"]]))
        trending = config.get("trending_hashtags", [])
        hashtags.extend([h for h in trending if h not in hashtags])
        hashtags = hashtags[:config["hashtag_count"] + 3]
        
        # Add channel tag if provided
        if channel_name:
            channel_tag = f"#{channel_name.replace(' ', '').lower()}"
            if channel_tag not in hashtags:
                hashtags.insert(0, channel_tag)
        
        # Select relevant emojis
        emoji_suggestions = self._select_emojis(segment_tags)
        
        # Generate platform-specific variants
        platform_specific = self._generate_platform_variants(
            titles, description, hashtags, segment_tags
        )
        
        return GeneratedContent(
            titles=titles,
            description=description,
            hashtags=hashtags,
            hook_suggestion=llm_result.hook_suggestion,
            emoji_suggestions=emoji_suggestions,
            platform_specific=platform_specific
        )
    
    def _generate_heuristic(
        self,
        transcript: str,
        segment_tags: List[str],
        platform: str,
        score_data: Optional[Dict[str, Any]],
        channel_name: Optional[str]
    ) -> GeneratedContent:
        """Generate content using heuristics when LLM is not available."""
        config = self.PLATFORM_CONFIG.get(platform, self.PLATFORM_CONFIG["tiktok"])
        
        # Extract key sentences
        sentences = re.split(r'[.!?]', transcript)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
        
        # Generate titles from transcript
        titles = []
        
        # Title from first impactful sentence
        if sentences:
            first = sentences[0]
            if len(first) <= config["max_title_length"]:
                titles.append(first)
            else:
                titles.append(first[:config["max_title_length"] - 3] + "...")
        
        # Title from tags
        if segment_tags:
            tag_based = self._generate_tag_based_title(segment_tags)
            if tag_based:
                titles.append(tag_based)
        
        # Generic viral title templates
        templates = [
            "Vous n'allez pas croire ce qui se passe...",
            "Le moment où tout a basculé 🔥",
            "C'est EXACTEMENT pour ça que je joue 💀",
            "Attendez la fin...",
        ]
        
        # Add template titles if needed
        while len(titles) < 3:
            titles.append(templates[len(titles) % len(templates)])
        
        # Truncate all titles
        titles = [t[:config["max_title_length"]] for t in titles]
        
        # Add emojis
        if config["emoji_heavy"]:
            titles = self._add_emojis_to_titles(titles, segment_tags)
        
        # Generate description
        description = self._generate_description(
            transcript, segment_tags, config["max_description_length"]
        )
        
        # Generate hashtags
        hashtags = self._generate_hashtags(segment_tags, platform, channel_name)
        
        # Select emojis
        emoji_suggestions = self._select_emojis(segment_tags)
        
        # Platform variants
        platform_specific = self._generate_platform_variants(
            titles, description, hashtags, segment_tags
        )
        
        return GeneratedContent(
            titles=titles[:5],
            description=description,
            hashtags=hashtags,
            hook_suggestion=sentences[0] if sentences else None,
            emoji_suggestions=emoji_suggestions,
            platform_specific=platform_specific
        )
    
    def _generate_tag_based_title(self, tags: List[str]) -> Optional[str]:
        """Generate a title based on detected tags."""
        # Map tags to title templates
        tag_templates = {
            "humour": ["Trop drôle 😂", "Je peux pas 💀"],
            "surprise": ["QUOI?! 😱", "Personne s'y attendait"],
            "clutch": ["LE CLUTCH 🔥", "COMMENT IL A FAIT ÇA"],
            "fail": ["Le fail de l'année 💀", "C'est pas possible..."],
            "rage": ["La rage est réelle 😤", "Il pète un câble"],
            "karmine": ["ALLEZ KC 🔵", "La Karmine fait le taf"],
            "esport": ["ESPORT MOMENT", "Pro play 🏆"],
        }
        
        for tag in tags:
            for key, templates in tag_templates.items():
                if key in tag.lower():
                    return templates[0]
        
        return None
    
    def _generate_description(
        self,
        transcript: str,
        tags: List[str],
        max_length: int
    ) -> str:
        """Generate a short description."""
        # Use first sentence if short enough
        sentences = re.split(r'[.!?]', transcript)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
        
        if sentences and len(sentences[0]) <= max_length:
            return sentences[0]
        
        # Generate from tags
        if tags:
            tag_str = ", ".join(tags[:3])
            return f"Moment {tag_str}"[:max_length]
        
        return "Un moment incroyable 🔥"
    
    def _generate_hashtags(
        self,
        tags: List[str],
        platform: str,
        channel_name: Optional[str]
    ) -> List[str]:
        """Generate relevant hashtags."""
        config = self.PLATFORM_CONFIG.get(platform, self.PLATFORM_CONFIG["tiktok"])
        hashtags = []
        
        # Add channel hashtag
        if channel_name:
            hashtags.append(f"#{channel_name.replace(' ', '').lower()}")
        
        # Convert tags to hashtags
        tag_to_hashtag = {
            "karmine": "#karminecorp",
            "lol": "#leagueoflegends",
            "esport": "#esport",
            "humour": "#funny",
            "clutch": "#clutch",
            "gaming": "#gaming",
            "fail": "#fail",
        }
        
        for tag in tags:
            for key, hashtag in tag_to_hashtag.items():
                if key in tag.lower() and hashtag not in hashtags:
                    hashtags.append(hashtag)
        
        # Add trending hashtags
        hashtags.extend(config.get("trending_hashtags", []))
        
        # Deduplicate
        seen = set()
        unique_hashtags = []
        for h in hashtags:
            if h.lower() not in seen:
                seen.add(h.lower())
                unique_hashtags.append(h)
        
        return unique_hashtags[:config["hashtag_count"] + 5]
    
    def _add_emojis_to_titles(
        self,
        titles: List[str],
        tags: List[str]
    ) -> List[str]:
        """Add relevant emojis to titles."""
        tag_emojis = {
            "humour": "😂",
            "surprise": "😱",
            "clutch": "🔥",
            "fail": "💀",
            "rage": "😤",
            "gaming": "🎮",
            "esport": "🏆",
            "karmine": "🔵",
        }
        
        # Find relevant emoji
        emoji = "🔥"  # Default
        for tag in tags:
            for key, e in tag_emojis.items():
                if key in tag.lower():
                    emoji = e
                    break
        
        # Add emoji if not already present
        enhanced = []
        for title in titles:
            if not any(e in title for e in self.VIRAL_EMOJIS):
                title = f"{title} {emoji}"
            enhanced.append(title)
        
        return enhanced
    
    def _select_emojis(self, tags: List[str]) -> List[str]:
        """Select relevant emojis based on tags."""
        tag_emojis = {
            "humour": ["😂", "🤣", "💀"],
            "surprise": ["😱", "🤯", "😮"],
            "clutch": ["🔥", "💪", "🏆"],
            "fail": ["💀", "😅", "🙃"],
            "rage": ["😤", "🤬", "💢"],
            "gaming": ["🎮", "🕹️", "👾"],
        }
        
        emojis = set()
        for tag in tags:
            for key, emoji_list in tag_emojis.items():
                if key in tag.lower():
                    emojis.update(emoji_list)
        
        if not emojis:
            emojis = {"🔥", "👀", "💪"}
        
        return list(emojis)[:5]
    
    def _generate_platform_variants(
        self,
        titles: List[str],
        description: str,
        hashtags: List[str],
        tags: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """Generate platform-specific content variants."""
        variants = {}
        
        for platform, config in self.PLATFORM_CONFIG.items():
            platform_titles = [
                t[:config["max_title_length"]] for t in titles
            ]
            platform_desc = description[:config["max_description_length"]]
            platform_hashtags = hashtags[:config["hashtag_count"]]
            
            # Add platform-specific trending tags
            trending = config.get("trending_hashtags", [])[:2]
            platform_hashtags.extend([h for h in trending if h not in platform_hashtags])
            
            variants[platform] = {
                "titles": platform_titles,
                "description": platform_desc,
                "hashtags": platform_hashtags[:config["hashtag_count"] + 2]
            }
        
        return variants
    
    async def generate_for_segment(
        self,
        segment: Dict[str, Any],
        platform: str = "tiktok",
        channel_name: Optional[str] = None
    ) -> GeneratedContent:
        """
        Generate content for a segment.
        
        Args:
            segment: Segment data with transcript and score
            platform: Target platform
            channel_name: Creator/channel name
        
        Returns:
            GeneratedContent
        """
        transcript = segment.get("transcript", "")
        score = segment.get("score", {})
        tags = score.get("tags", [])
        
        return await self.generate_content(
            transcript=transcript,
            segment_tags=tags,
            platform=platform,
            score_data=score,
            channel_name=channel_name
        )


# Convenience functions
def get_content_generation_service() -> ContentGenerationService:
    """Get the content generation service instance."""
    return ContentGenerationService.get_instance()
