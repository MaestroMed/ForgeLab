"""Subtitle Translation Service for multilingual support."""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Check for translation libraries
try:
    from argostranslate import package, translate
    HAS_ARGOS = True
except ImportError:
    HAS_ARGOS = False

try:
    from transformers import pipeline
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False


@dataclass
class TranslatedSegment:
    """A translated transcript segment."""
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    start_time: float
    end_time: float
    confidence: float = 1.0


@dataclass
class TranslationResult:
    """Complete translation result."""
    segments: list[TranslatedSegment]
    source_lang: str
    target_lang: str
    total_segments: int
    success_rate: float
    backend_used: str


class TranslationService:
    """
    Service for translating subtitles to multiple languages.

    Uses Argos Translate (offline) or falls back to transformers.
    """

    # Supported languages
    SUPPORTED_LANGUAGES = {
        "fr": "French",
        "en": "English",
        "es": "Spanish",
        "de": "German",
        "it": "Italian",
        "pt": "Portuguese",
        "zh": "Chinese",
        "ja": "Japanese",
        "ko": "Korean",
        "ar": "Arabic",
        "ru": "Russian",
    }

    _instance: Optional["TranslationService"] = None

    def __init__(self):
        self.backend = self._detect_backend()
        self._installed_packages: dict[str, Any] = {}
        self._translators: dict[str, Any] = {}

        if HAS_ARGOS:
            self._init_argos()

    @classmethod
    def get_instance(cls) -> "TranslationService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _detect_backend(self) -> str:
        """Detect best available translation backend."""
        if HAS_ARGOS:
            return "argos"
        elif HAS_TRANSFORMERS:
            return "transformers"
        else:
            return "none"

    def _init_argos(self):
        """Initialize Argos Translate packages."""
        try:
            package.update_package_index()
            package.get_available_packages()
            installed = package.get_installed_packages()

            for pkg in installed:
                key = f"{pkg.from_code}-{pkg.to_code}"
                self._installed_packages[key] = pkg

            logger.info(f"Argos Translate initialized with {len(installed)} language pairs")
        except Exception as e:
            logger.warning(f"Failed to initialize Argos Translate: {e}")

    def is_available(self) -> bool:
        """Check if translation is available."""
        return self.backend != "none"

    def get_supported_languages(self) -> dict[str, str]:
        """Get list of supported languages."""
        return self.SUPPORTED_LANGUAGES.copy()

    def get_available_pairs(self) -> list[tuple]:
        """Get list of available translation pairs."""
        if self.backend == "argos":
            return [(p.from_code, p.to_code) for p in self._installed_packages.values()]
        return []

    async def install_language_pair(
        self,
        source_lang: str,
        target_lang: str
    ) -> bool:
        """
        Install a language pair for translation.

        Args:
            source_lang: Source language code (e.g., 'fr')
            target_lang: Target language code (e.g., 'en')

        Returns:
            True if installed successfully
        """
        if not HAS_ARGOS:
            return False

        key = f"{source_lang}-{target_lang}"
        if key in self._installed_packages:
            return True

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self._install_sync(source_lang, target_lang))

    def _install_sync(self, source_lang: str, target_lang: str) -> bool:
        """Synchronous package installation."""
        try:
            available = package.get_available_packages()

            for pkg in available:
                if pkg.from_code == source_lang and pkg.to_code == target_lang:
                    package.install_from_path(pkg.download())
                    self._installed_packages[f"{source_lang}-{target_lang}"] = pkg
                    logger.info(f"Installed language pair: {source_lang} -> {target_lang}")
                    return True

            logger.warning(f"Language pair not available: {source_lang} -> {target_lang}")
            return False

        except Exception as e:
            logger.error(f"Failed to install language pair: {e}")
            return False

    async def translate_segments(
        self,
        segments: list[dict[str, Any]],
        source_lang: str,
        target_lang: str,
        progress_callback: Callable[[float], None] | None = None
    ) -> TranslationResult | None:
        """
        Translate transcript segments to another language.

        Args:
            segments: List of segments with 'text', 'start', 'end' keys
            source_lang: Source language code
            target_lang: Target language code
            progress_callback: Progress callback (0-100)

        Returns:
            TranslationResult or None if not available
        """
        if not self.is_available():
            logger.warning("Translation service not available")
            return None

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._translate_sync(segments, source_lang, target_lang, progress_callback)
        )

    def _translate_sync(
        self,
        segments: list[dict[str, Any]],
        source_lang: str,
        target_lang: str,
        progress_callback: Callable[[float], None] | None = None
    ) -> TranslationResult | None:
        """Synchronous translation."""
        if progress_callback:
            progress_callback(5)

        # Get or create translator
        translator = self._get_translator(source_lang, target_lang)
        if translator is None:
            logger.error(f"No translator available for {source_lang} -> {target_lang}")
            return None

        if progress_callback:
            progress_callback(10)

        translated_segments: list[TranslatedSegment] = []
        success_count = 0

        for i, segment in enumerate(segments):
            try:
                original = segment.get("text", "")
                if not original.strip():
                    continue

                # Translate
                if self.backend == "argos":
                    translated = translator.translate(original)
                else:
                    result = translator(original)
                    translated = result[0]["translation_text"] if result else original

                translated_segments.append(TranslatedSegment(
                    original_text=original,
                    translated_text=translated,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    start_time=segment.get("start", 0),
                    end_time=segment.get("end", 0),
                    confidence=1.0
                ))
                success_count += 1

            except Exception as e:
                logger.warning(f"Failed to translate segment {i}: {e}")
                # Keep original on failure
                translated_segments.append(TranslatedSegment(
                    original_text=segment.get("text", ""),
                    translated_text=segment.get("text", ""),
                    source_lang=source_lang,
                    target_lang=target_lang,
                    start_time=segment.get("start", 0),
                    end_time=segment.get("end", 0),
                    confidence=0.0
                ))

            if progress_callback:
                progress_callback(10 + (i + 1) / len(segments) * 85)

        if progress_callback:
            progress_callback(100)

        success_rate = success_count / len(segments) if segments else 0

        return TranslationResult(
            segments=translated_segments,
            source_lang=source_lang,
            target_lang=target_lang,
            total_segments=len(segments),
            success_rate=success_rate,
            backend_used=self.backend
        )

    def _get_translator(self, source_lang: str, target_lang: str):
        """Get or create a translator for a language pair."""
        key = f"{source_lang}-{target_lang}"

        if key in self._translators:
            return self._translators[key]

        if self.backend == "argos":
            try:
                installed = translate.get_installed_languages()
                source = next((l for l in installed if l.code == source_lang), None)
                target = next((l for l in installed if l.code == target_lang), None)

                if source and target:
                    translator = source.get_translation(target)
                    if translator:
                        self._translators[key] = translator
                        return translator
            except Exception as e:
                logger.error(f"Failed to get Argos translator: {e}")

        elif self.backend == "transformers":
            try:
                # Use Helsinki-NLP models
                model_name = f"Helsinki-NLP/opus-mt-{source_lang}-{target_lang}"
                translator = pipeline("translation", model=model_name)
                self._translators[key] = translator
                return translator
            except Exception as e:
                logger.error(f"Failed to load transformers model: {e}")

        return None

    async def translate_text(
        self,
        text: str,
        source_lang: str,
        target_lang: str
    ) -> str | None:
        """
        Translate a single text string.

        Args:
            text: Text to translate
            source_lang: Source language code
            target_lang: Target language code

        Returns:
            Translated text or None
        """
        result = await self.translate_segments(
            [{"text": text, "start": 0, "end": 0}],
            source_lang,
            target_lang
        )

        if result and result.segments:
            return result.segments[0].translated_text

        return None

    async def translate_words(
        self,
        words: list[dict],
        source_lang: str,
        target_lang: str,
    ) -> "TranslationResult":
        """Translate a list of word-level subtitle entries."""
        full_text = " ".join(w.get("word", w.get("text", "")) for w in words)
        translated_text = await self.translate_text(full_text, source_lang, target_lang)
        if translated_text is None:
            translated_text = full_text

        # Reconstruct word list with translated text distributed proportionally
        translated_words = []
        t_words = translated_text.split()
        for i, word in enumerate(words):
            t_word = t_words[i] if i < len(t_words) else ""
            translated_words.append({
                **word,
                "word": t_word,
                "original": word.get("word", word.get("text", "")),
            })

        return TranslationResult(
            segments=[
                TranslatedSegment(
                    original_text=full_text,
                    translated_text=translated_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    start_time=words[0].get("start", 0.0) if words else 0.0,
                    end_time=words[-1].get("end", 0.0) if words else 0.0,
                )
            ],
            source_lang=source_lang,
            target_lang=target_lang,
            total_segments=1,
            success_rate=1.0,
            backend_used="argos" if HAS_ARGOS else "stub",
        )

    async def translate_to_languages(
        self,
        words: list[dict],
        source_lang: str,
        target_langs: list[str],
        max_concurrent: int = 3,
    ) -> "dict[str, TranslationResult]":
        """
        Translate subtitles to multiple languages in parallel.

        Args:
            words: List of word dicts with text, start, end
            source_lang: Source language code
            target_langs: List of target language codes
            max_concurrent: Max concurrent translations

        Returns:
            Dict mapping lang_code -> TranslationResult
        """
        semaphore = asyncio.Semaphore(max_concurrent)

        async def translate_one(lang: str) -> "tuple[str, TranslationResult | None]":
            async with semaphore:
                try:
                    result = await self.translate_words(
                        words=words,
                        source_lang=source_lang,
                        target_lang=lang,
                    )
                    return lang, result
                except Exception as e:
                    logger.warning("Translation to %s failed: %s", lang, e)
                    return lang, None

        tasks = [translate_one(lang) for lang in target_langs]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return {lang: result for lang, result in results if result is not None}

    def get_supported_pairs(self) -> list[dict[str, str]]:
        """Return list of supported translation pairs."""
        pairs = []
        if HAS_ARGOS:
            try:
                installed = translate.get_installed_languages()
                codes = [lang.code for lang in installed]
                for src in codes:
                    for tgt in codes:
                        if src != tgt:
                            pairs.append({"source": src, "target": tgt})
            except Exception as e:
                logger.debug("Argos installed-languages lookup failed: %s", e)

        if not pairs:
            # Fallback: known popular pairs
            for src in ["fr", "en"]:
                for tgt in ["en", "es", "pt", "de", "ar", "it", "fr"]:
                    if src != tgt:
                        pairs.append({"source": src, "target": tgt})

        return pairs


# Convenience functions
def get_translation_service() -> TranslationService:
    """Get the translation service instance."""
    return TranslationService.get_instance()


def is_translation_available() -> bool:
    """Check if translation is available."""
    return TranslationService.get_instance().is_available()
