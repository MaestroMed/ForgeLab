"""Content Generation Service for viral titles, descriptions, and hashtags."""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class GeneratedContent:
    """Generated content for a clip."""
    titles: list[str]
    description: str
    hashtags: list[str]
    hook_suggestion: str | None = None
    emoji_suggestions: list[str] = field(default_factory=list)
    platform_specific: dict[str, dict[str, Any]] = field(default_factory=dict)


class ContentGenerationService:
    """Service for generating viral content (titles, descriptions, hashtags)."""

    # Platform-specific configurations
    PLATFORM_CONFIG = {
        "tiktok": {
            "max_title_length": 100,
            "max_description_length": 150,
            "hashtag_count": 20,
            "emoji_heavy": True,
            "trending_hashtags": ["#fyp", "#foryou", "#viral", "#pourtoi", "#foryoupage"]
        },
        "youtube": {
            "max_title_length": 60,
            "max_description_length": 200,
            "hashtag_count": 20,
            "emoji_heavy": False,
            "trending_hashtags": ["#shorts", "#gaming", "#viral"]
        },
        "instagram": {
            "max_title_length": 100,
            "max_description_length": 300,
            "hashtag_count": 20,
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
        segment_tags: list[str],
        platform: str = "tiktok",
        score_data: dict[str, Any] | None = None,
        channel_name: str | None = None
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
        segment_tags: list[str],
        channel_name: str | None
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
        segment_tags: list[str],
        platform: str,
        score_data: dict[str, Any] | None,
        channel_name: str | None
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

    def _generate_tag_based_title(self, tags: list[str]) -> str | None:
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
        tags: list[str],
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
        tags: list[str],
        platform: str,
        channel_name: str | None
    ) -> list[str]:
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

        return unique_hashtags[:20]

    def _add_emojis_to_titles(
        self,
        titles: list[str],
        tags: list[str]
    ) -> list[str]:
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

    def _select_emojis(self, tags: list[str]) -> list[str]:
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
        titles: list[str],
        description: str,
        hashtags: list[str],
        tags: list[str]
    ) -> dict[str, dict[str, Any]]:
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

    @staticmethod
    def detect_language(text: str) -> str:
        """Detect language from transcript text (simple heuristic)."""
        fr_indicators = ["je", "le", "la", "les", "un", "une", "des", "du", "est", "sont", "avec", "dans", "pour"]
        words = text.lower().split()[:50]
        fr_count = sum(1 for w in words if w in fr_indicators)
        return "fr" if fr_count >= 3 else "en"

    def is_available(self) -> bool:
        """Check if LLM-based generation is available (cached)."""
        if self._llm_available is not None:
            return self._llm_available
        return False

    async def generate_titles(
        self,
        transcript: str,
        context: str | None = None,
        style: str | None = None,
        count: int = 5,
        platform: str = "tiktok",
    ) -> list[str]:
        """Generate viral titles for a clip."""
        language = self.detect_language(transcript)
        result = await self.generate_content(
            transcript=transcript,
            segment_tags=[context] if context else [],
            platform=platform,
        )
        titles = result.titles[:count]
        # Pad with platform-specific fallbacks if needed
        fallbacks_fr = [
            "Vous n'allez pas croire ce qui se passe... 🔥",
            "Le moment où tout a basculé 💀",
            "Il a vraiment fait ça ?! 😱",
            "Attendez la fin... ⚡",
            "LÉGENDAIRE 🏆",
        ]
        fallbacks_en = [
            "You won't believe what happened... 🔥",
            "The moment everything changed 💀",
            "Did he really do that?! 😱",
            "Wait for it... ⚡",
            "LEGENDARY 🏆",
        ]
        fallbacks = fallbacks_fr if language == "fr" else fallbacks_en
        while len(titles) < count:
            titles.append(fallbacks[len(titles) % len(fallbacks)])
        return titles[:count]

    async def generate_description(
        self,
        transcript: str,
        title: str | None = None,
        platform: str = "tiktok",
        max_length: int = 300,
    ) -> str:
        """Generate a platform-optimized description."""
        result = await self.generate_content(
            transcript=transcript,
            segment_tags=[],
            platform=platform,
        )
        desc = result.description[:max_length]
        return desc or transcript[:max_length]

    async def generate_hashtags(
        self,
        transcript: str,
        title: str | None = None,
        platform: str = "tiktok",
        count: int = 20,
    ) -> list[str]:
        """Generate hashtags, up to 20, for a clip."""
        language = self.detect_language(transcript)
        result = await self.generate_content(
            transcript=transcript,
            segment_tags=[],
            platform=platform,
        )
        hashtags = list(result.hashtags)

        # Ensure we have enough hashtags with viral defaults
        viral_fr = [
            "#viral", "#fyp", "#pourtoi", "#foryou", "#trending",
            "#clip", "#gaming", "#streamer", "#reaction", "#drole",
            "#incroyable", "#fou", "#france", "#humour", "#omg",
            "#highlight", "#bestof", "#gaming", "#content", "#vibes",
        ]
        viral_en = [
            "#viral", "#fyp", "#foryou", "#trending", "#clip",
            "#gaming", "#streamer", "#reaction", "#funny", "#omg",
            "#insane", "#clips", "#highlight", "#twitch", "#youtube",
            "#content", "#vibes", "#bestof", "#gaming", "#epic",
        ]
        fallbacks = viral_fr if language == "fr" else viral_en
        seen = {h.lower() for h in hashtags}
        for h in fallbacks:
            if h.lower() not in seen and len(hashtags) < count:
                hashtags.append(h)
                seen.add(h.lower())

        return hashtags[:count]

    async def generate_for_segment_full(
        self,
        segment: dict[str, Any],
        platform: str = "tiktok",
        channel_name: str | None = None,
    ) -> dict[str, Any]:
        """Generate complete publishable content (title, description, 20 hashtags)."""
        transcript = segment.get("transcript", "")
        score = segment.get("score", {})
        tags = score.get("tags", [])
        language = self.detect_language(transcript)

        result = await self.generate_content(
            transcript=transcript,
            segment_tags=tags,
            platform=platform,
            channel_name=channel_name,
        )

        hashtags = await self.generate_hashtags(
            transcript=transcript,
            platform=platform,
            count=20,
        )

        return {
            "titles": result.titles,
            "description": result.description,
            "hashtags": hashtags,
            "hook_suggestion": result.hook_suggestion,
            "emoji_suggestions": result.emoji_suggestions,
            "language": language,
            "platform": platform,
        }

    async def generate_for_segment(
        self,
        segment: dict[str, Any],
        platform: str = "tiktok",
        channel_name: str | None = None
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
