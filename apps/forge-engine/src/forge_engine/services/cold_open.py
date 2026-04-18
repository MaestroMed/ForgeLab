"""Cold Open Engine Service.

Generates cold open variations for viral clips.

Cold Open Structure:
1. Start with a hook (the best moment) - 3-8 seconds
2. Transition/tease ("let me explain" or visual freeze)
3. Start from the beginning of the segment

This technique hooks viewers immediately, then rewards them with context.

Usage:
    from forge_engine.services.cold_open import ColdOpenEngine
    
    engine = ColdOpenEngine()
    variations = await engine.generate_cold_opens(segment, transcript_segments)
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class ColdOpenStyle(str, Enum):
    """Types of cold open transitions."""
    HARD_CUT = "hard_cut"           # Immediate cut to start
    FREEZE_FRAME = "freeze_frame"   # Freeze on hook, then cut
    TEXT_OVERLAY = "text_overlay"   # "Earlier..." or "Let me explain"
    ZOOM_TRANSITION = "zoom_transition"  # Zoom/blur transition
    REWIND = "rewind"               # Visual rewind effect


@dataclass
class ColdOpenHook:
    """A detected hook point for cold open."""
    start_time: float
    end_time: float
    text: str
    score: int
    reasons: List[str] = field(default_factory=list)
    
    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


@dataclass
class ColdOpenVariation:
    """A cold open variation for A/B testing."""
    id: str
    style: ColdOpenStyle
    hook: ColdOpenHook
    original_start: float
    original_end: float
    
    # Rendered timeline
    timeline: List[Dict[str, Any]] = field(default_factory=list)
    
    # Scoring
    predicted_retention: float = 0.0
    reasons: List[str] = field(default_factory=list)


class ColdOpenEngine:
    """Engine for generating cold open variations."""
    
    # Hook detection patterns with higher specificity for cold opens
    COLD_OPEN_PATTERNS = [
        # Questions that create intrigue
        (r"\b(tu sais quoi|guess what|you know what|devine)\b.*\?", 8, "intrigue_question"),
        (r"\b(comment|pourquoi|why|how)\b.*\?", 6, "explanation_needed"),
        
        # Shocking statements
        (r"\b(je l'ai fait|i did it|on l'a fait|we did it)\b", 7, "achievement"),
        (r"\b(c'est fini|it's over|game over|terminé)\b", 7, "conclusion"),
        (r"\b(incroyable|insane|crazy|dingue|ouf|unbelievable)\b", 6, "reaction"),
        
        # Strong emotional hooks
        (r"\b(non mais là|wait wait|hold on|attends)\b", 7, "surprise"),
        (r"!{2,}", 5, "excitement"),
        (r"\?{2,}", 5, "confusion"),
        
        # Esport/Gaming climax
        (r"\b(pentakill|penta|ace|baron steal|clutch)\b", 8, "esport_climax"),
        (r"\b(c'est gagné|on a win|victory|we won)\b", 7, "victory"),
        (r"\b(c'est perdu|il est mort|he's dead|rip)\b", 6, "dramatic"),
        
        # Debate/controversy hooks
        (r"\b(vous êtes pas prêts|you're not ready|attention)\b", 7, "buildup"),
        (r"\b(je vais vous dire|let me tell you|écoutez)\b", 6, "announcement"),
    ]
    
    # Transition text options
    TRANSITION_TEXTS = {
        "fr": [
            "Quelques minutes plus tôt...",
            "Laissez-moi vous expliquer...",
            "Tout a commencé quand...",
            "Mais avant ça...",
            "Comment on en est arrivé là ?",
        ],
        "en": [
            "A few minutes earlier...",
            "Let me explain...",
            "It all started when...",
            "But before that...",
            "How did we get here?",
        ],
    }
    
    def __init__(self):
        self.min_hook_duration = 2.0  # Minimum hook duration (seconds)
        self.max_hook_duration = 8.0  # Maximum hook duration
        self.optimal_hook_duration = 4.0  # Sweet spot
        
        # Cold open settings
        self.max_variations = 3  # Maximum A/B/C test variations
        self.min_hook_score = 5  # Minimum score to consider as hook
    
    async def generate_cold_opens(
        self,
        segment: Dict[str, Any],
        transcript_segments: List[Dict[str, Any]],
        language: str = "fr",
        max_variations: int = None,
    ) -> List[ColdOpenVariation]:
        """Generate cold open variations for a segment.
        
        Args:
            segment: The video segment with start/end times
            transcript_segments: Transcript segments with timing
            language: Language for transition texts
            max_variations: Maximum number of variations to generate
            
        Returns:
            List of ColdOpenVariation for A/B testing
        """
        if max_variations is None:
            max_variations = self.max_variations
        
        # Find potential hooks within the segment
        hooks = self._find_hooks(
            segment, 
            transcript_segments,
            min_score=self.min_hook_score
        )
        
        if not hooks:
            logger.info("No suitable hooks found for cold open")
            return []
        
        # Sort hooks by score
        hooks.sort(key=lambda h: h.score, reverse=True)
        
        # Generate variations for top hooks
        variations = []
        
        for i, hook in enumerate(hooks[:max_variations]):
            # Try different styles for the top hook
            if i == 0:
                # Best hook: try multiple styles
                for style in [ColdOpenStyle.HARD_CUT, ColdOpenStyle.TEXT_OVERLAY]:
                    variation = self._create_variation(
                        hook=hook,
                        segment=segment,
                        style=style,
                        language=language,
                        variation_id=f"v{len(variations) + 1}",
                    )
                    if variation:
                        variations.append(variation)
            else:
                # Other hooks: just hard cut
                variation = self._create_variation(
                    hook=hook,
                    segment=segment,
                    style=ColdOpenStyle.HARD_CUT,
                    language=language,
                    variation_id=f"v{len(variations) + 1}",
                )
                if variation:
                    variations.append(variation)
        
        # Add original (no cold open) as control
        control = ColdOpenVariation(
            id="control",
            style=ColdOpenStyle.HARD_CUT,  # Not really used
            hook=ColdOpenHook(
                start_time=segment["start_time"],
                end_time=segment["start_time"] + 3,
                text="[Original opening]",
                score=0,
            ),
            original_start=segment["start_time"],
            original_end=segment["end_time"],
            timeline=[{
                "type": "segment",
                "start": segment["start_time"],
                "end": segment["end_time"],
            }],
            predicted_retention=0.5,  # Baseline
            reasons=["Original order (control)"],
        )
        variations.append(control)
        
        logger.info(
            "Generated %d cold open variations for segment %.1f-%.1f",
            len(variations), segment["start_time"], segment["end_time"]
        )
        
        return variations
    
    def _find_hooks(
        self,
        segment: Dict[str, Any],
        transcript_segments: List[Dict[str, Any]],
        min_score: int = 5,
    ) -> List[ColdOpenHook]:
        """Find potential hook points within a segment."""
        hooks = []
        
        start_time = segment["start_time"]
        end_time = segment["end_time"]
        segment_duration = end_time - start_time
        
        # Only look for hooks in the middle-to-end of segment
        # (not the beginning, that's where we're cutting TO)
        search_start = start_time + segment_duration * 0.2
        search_end = end_time - 2  # Leave room for context
        
        for seg in transcript_segments:
            # Skip if outside search window
            if seg["end"] < search_start or seg["start"] > search_end:
                continue
            
            text = seg.get("text", "")
            score = 0
            reasons = []
            
            # Check against cold open patterns
            for pattern, points, reason in self.COLD_OPEN_PATTERNS:
                if re.search(pattern, text, re.IGNORECASE):
                    score += points
                    reasons.append(reason)
            
            # Bonus for punctuation
            if text.strip().endswith("!"):
                score += 2
            if text.strip().endswith("?"):
                score += 2
            
            # Bonus for short punchy text (3-10 words)
            word_count = len(text.split())
            if 3 <= word_count <= 10:
                score += 2
                reasons.append("punchy_length")
            
            # Create hook if score is high enough
            if score >= min_score:
                hook = ColdOpenHook(
                    start_time=seg["start"],
                    end_time=seg["end"],
                    text=text,
                    score=score,
                    reasons=reasons,
                )
                hooks.append(hook)
        
        # Also check for word-level hooks if available
        for seg in transcript_segments:
            if seg["end"] < search_start or seg["start"] > search_end:
                continue
            
            words = seg.get("words", [])
            for i, word in enumerate(words):
                word_text = word.get("word", "")
                
                # Check for single-word hooks (exclamations)
                if word_text.lower() in ["wow", "quoi", "non", "oh", "damn", "putain"]:
                    # Create a hook around this word
                    hook_start = word.get("start", seg["start"])
                    hook_end = word.get("end", seg["end"])
                    
                    # Extend to include a few more words for context
                    if i + 3 < len(words):
                        hook_end = words[i + 3].get("end", hook_end)
                    
                    hook = ColdOpenHook(
                        start_time=hook_start,
                        end_time=hook_end,
                        text=" ".join(w.get("word", "") for w in words[i:i+4]),
                        score=6,
                        reasons=["exclamation_word"],
                    )
                    hooks.append(hook)
        
        # Deduplicate hooks that overlap
        hooks = self._deduplicate_hooks(hooks)
        
        return hooks
    
    def _deduplicate_hooks(self, hooks: List[ColdOpenHook]) -> List[ColdOpenHook]:
        """Remove overlapping hooks, keeping higher scored ones."""
        if not hooks:
            return []
        
        # Sort by score descending
        sorted_hooks = sorted(hooks, key=lambda h: h.score, reverse=True)
        
        kept = []
        for hook in sorted_hooks:
            # Check if overlaps with any kept hook
            overlaps = False
            for kept_hook in kept:
                # Calculate overlap
                overlap_start = max(hook.start_time, kept_hook.start_time)
                overlap_end = min(hook.end_time, kept_hook.end_time)
                
                if overlap_end > overlap_start:
                    overlap_ratio = (overlap_end - overlap_start) / hook.duration
                    if overlap_ratio > 0.5:
                        overlaps = True
                        break
            
            if not overlaps:
                kept.append(hook)
        
        return kept
    
    def _create_variation(
        self,
        hook: ColdOpenHook,
        segment: Dict[str, Any],
        style: ColdOpenStyle,
        language: str,
        variation_id: str,
    ) -> Optional[ColdOpenVariation]:
        """Create a cold open variation."""
        original_start = segment["start_time"]
        original_end = segment["end_time"]
        
        # Ensure hook is within segment
        if hook.start_time < original_start or hook.end_time > original_end:
            return None
        
        # Ensure hook duration is valid
        hook_duration = hook.duration
        if hook_duration < self.min_hook_duration:
            # Extend hook
            hook = ColdOpenHook(
                start_time=hook.start_time,
                end_time=min(hook.start_time + self.min_hook_duration, original_end),
                text=hook.text,
                score=hook.score,
                reasons=hook.reasons,
            )
        elif hook_duration > self.max_hook_duration:
            # Trim hook
            hook = ColdOpenHook(
                start_time=hook.start_time,
                end_time=hook.start_time + self.max_hook_duration,
                text=hook.text,
                score=hook.score,
                reasons=hook.reasons,
            )
        
        # Build timeline based on style
        timeline = []
        reasons = []
        
        if style == ColdOpenStyle.HARD_CUT:
            # Hook -> Original start -> Hook point -> End
            timeline = [
                {
                    "type": "hook",
                    "start": hook.start_time,
                    "end": hook.end_time,
                    "label": "Cold Open Hook",
                },
                {
                    "type": "segment",
                    "start": original_start,
                    "end": hook.start_time,
                    "label": "Context",
                },
                {
                    "type": "segment",
                    "start": hook.end_time,
                    "end": original_end,
                    "label": "Continuation",
                },
            ]
            reasons.append("Hard cut transition")
            
        elif style == ColdOpenStyle.TEXT_OVERLAY:
            # Hook -> Transition text -> Original start
            transition_texts = self.TRANSITION_TEXTS.get(language, self.TRANSITION_TEXTS["en"])
            transition_text = transition_texts[hash(hook.text) % len(transition_texts)]
            
            timeline = [
                {
                    "type": "hook",
                    "start": hook.start_time,
                    "end": hook.end_time,
                    "label": "Cold Open Hook",
                },
                {
                    "type": "transition",
                    "duration": 1.5,
                    "text": transition_text,
                    "style": "fade_text",
                    "label": "Transition",
                },
                {
                    "type": "segment",
                    "start": original_start,
                    "end": hook.start_time,
                    "label": "Context",
                },
                {
                    "type": "segment",
                    "start": hook.end_time,
                    "end": original_end,
                    "label": "Continuation",
                },
            ]
            reasons.append(f'Text transition: "{transition_text}"')
            
        elif style == ColdOpenStyle.FREEZE_FRAME:
            # Hook -> Freeze -> Original start
            timeline = [
                {
                    "type": "hook",
                    "start": hook.start_time,
                    "end": hook.end_time,
                    "label": "Cold Open Hook",
                },
                {
                    "type": "transition",
                    "duration": 1.0,
                    "effect": "freeze",
                    "frame_time": hook.end_time,
                    "label": "Freeze Frame",
                },
                {
                    "type": "segment",
                    "start": original_start,
                    "end": hook.start_time,
                    "label": "Context",
                },
                {
                    "type": "segment",
                    "start": hook.end_time,
                    "end": original_end,
                    "label": "Continuation",
                },
            ]
            reasons.append("Freeze frame transition")
            
        elif style == ColdOpenStyle.REWIND:
            # Hook -> Rewind effect -> Original start
            timeline = [
                {
                    "type": "hook",
                    "start": hook.start_time,
                    "end": hook.end_time,
                    "label": "Cold Open Hook",
                },
                {
                    "type": "transition",
                    "duration": 1.5,
                    "effect": "rewind",
                    "label": "Rewind Effect",
                },
                {
                    "type": "segment",
                    "start": original_start,
                    "end": hook.start_time,
                    "label": "Context",
                },
                {
                    "type": "segment",
                    "start": hook.end_time,
                    "end": original_end,
                    "label": "Continuation",
                },
            ]
            reasons.append("Rewind effect transition")
        
        # Calculate predicted retention based on hook score
        base_retention = 0.5
        hook_bonus = min(hook.score / 20, 0.3)  # Up to +30%
        style_bonus = 0.05 if style in [ColdOpenStyle.TEXT_OVERLAY, ColdOpenStyle.FREEZE_FRAME] else 0
        
        predicted_retention = base_retention + hook_bonus + style_bonus
        
        return ColdOpenVariation(
            id=variation_id,
            style=style,
            hook=hook,
            original_start=original_start,
            original_end=original_end,
            timeline=timeline,
            predicted_retention=predicted_retention,
            reasons=reasons + hook.reasons,
        )
    
    def generate_ffmpeg_filter(
        self,
        variation: ColdOpenVariation,
        input_file: str = "0",
    ) -> str:
        """Generate FFmpeg filter complex for cold open effect.
        
        Generates both video and audio streams for proper A/V sync.
        Returns the filter_complex string for FFmpeg.
        """
        filters = []
        video_parts = []
        audio_parts = []
        
        for i, item in enumerate(variation.timeline):
            if item["type"] in ("hook", "segment"):
                start = item["start"]
                end = item["end"]
                label = "hook" if item["type"] == "hook" else "seg"
                filters.append(
                    f"[{input_file}:v]trim=start={start}:end={end},"
                    f"setpts=PTS-STARTPTS[{label}v{i}]"
                )
                filters.append(
                    f"[{input_file}:a]atrim=start={start}:end={end},"
                    f"asetpts=PTS-STARTPTS[{label}a{i}]"
                )
                video_parts.append(f"[{label}v{i}]")
                audio_parts.append(f"[{label}a{i}]")
                
            elif item["type"] == "transition":
                duration = item.get("duration", 1.0)
                
                if item.get("effect") == "freeze":
                    frame_time = item.get("frame_time", 0)
                    filters.append(
                        f"[{input_file}:v]trim=start={frame_time}:end={frame_time + 0.04},"
                        f"setpts=PTS-STARTPTS,loop=loop={int(duration * 25)}:size=1:start=0,"
                        f"setpts=PTS-STARTPTS[freezev{i}]"
                    )
                    filters.append(
                        f"anullsrc=r=48000:cl=stereo,atrim=0:{duration}[freezea{i}]"
                    )
                    video_parts.append(f"[freezev{i}]")
                    audio_parts.append(f"[freezea{i}]")
                    
                elif item.get("text"):
                    text = item["text"].replace("'", "\\'")
                    filters.append(
                        f"color=black:s=1080x1920:d={duration},"
                        f"drawtext=text='{text}':fontcolor=white:fontsize=48:"
                        f"x=(w-text_w)/2:y=(h-text_h)/2[textv{i}]"
                    )
                    filters.append(
                        f"anullsrc=r=48000:cl=stereo,atrim=0:{duration}[texta{i}]"
                    )
                    video_parts.append(f"[textv{i}]")
                    audio_parts.append(f"[texta{i}]")
                    
                elif item.get("effect") == "rewind":
                    filters.append(
                        f"color=black:s=1080x1920:d={duration}[rewindv{i}]"
                    )
                    filters.append(
                        f"anullsrc=r=48000:cl=stereo,atrim=0:{duration}[rewinda{i}]"
                    )
                    video_parts.append(f"[rewindv{i}]")
                    audio_parts.append(f"[rewinda{i}]")
        
        n = len(video_parts)
        concat_in = "".join(f"{v}{a}" for v, a in zip(video_parts, audio_parts))
        filters.append(f"{concat_in}concat=n={n}:v=1:a=1[outv][outa]")
        
        return ";".join(filters)
    
    def compare_variations(
        self,
        variations: List[ColdOpenVariation],
    ) -> Dict[str, Any]:
        """Compare variations for A/B testing preview.
        
        Returns comparison data for UI display.
        """
        if not variations:
            return {"variations": [], "recommendation": None}
        
        # Sort by predicted retention
        sorted_vars = sorted(variations, key=lambda v: v.predicted_retention, reverse=True)
        
        comparison = {
            "variations": [],
            "recommendation": sorted_vars[0].id if sorted_vars else None,
        }
        
        for var in sorted_vars:
            var_data = {
                "id": var.id,
                "style": var.style.value,
                "hook_text": var.hook.text,
                "hook_score": var.hook.score,
                "hook_start": var.hook.start_time,
                "hook_end": var.hook.end_time,
                "predicted_retention": var.predicted_retention,
                "reasons": var.reasons,
                "timeline": var.timeline,
                "is_control": var.id == "control",
            }
            comparison["variations"].append(var_data)
        
        return comparison
    
    async def render_preview(
        self,
        variation: ColdOpenVariation,
        source_path: str,
        output_path: str,
        preview_quality: str = "low",
    ) -> Dict[str, Any]:
        """Render a preview of a cold open variation.
        
        Uses FFmpegService.render_clip with a simple filter to produce
        a quick preview of the cold open timeline.
        """
        from forge_engine.services.ffmpeg import FFmpegService
        
        ffmpeg = FFmpegService.get_instance()
        
        duration = variation.original_end - variation.original_start
        width = 540 if preview_quality == "low" else 1080
        height = 960 if preview_quality == "low" else 1920
        crf = 28 if preview_quality == "low" else 20
        
        success = await ffmpeg.render_clip(
            input_path=source_path,
            output_path=output_path,
            start_time=variation.original_start,
            duration=duration,
            filters=[f"scale={width}:{height}"],
            use_nvenc=False,
            crf=crf,
            width=width,
            height=height,
            fps=30,
        )
        
        return {
            "output_path": output_path,
            "variation_id": variation.id,
            "style": variation.style.value,
            "success": success,
        }
