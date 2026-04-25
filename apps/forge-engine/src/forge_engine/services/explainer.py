"""Segment explainer — turns raw scores into human-readable evidence.

Given a Segment row (with its score, tags, transcript, audio/visual
signals), produces a SegmentExplanation row containing:
 - Short natural-language summary
 - Strengths (what makes this clip strong)
 - Weaknesses (what to watch out for)
 - Per-signal subscores
 - Evidence organized by signal (transcript / audio / visual / temporal)
 - Suggested publishing metadata (title, hashtags, platforms)

Pipeline:
 1. Derive rule-based subscores from Segment fields (deterministic)
 2. Derive evidence strings from the same fields (deterministic)
 3. If Ollama is available, ask LLM for a polished 1-sentence summary
    + suggested title. Otherwise fall back to templated text.

The output is deterministic-enough to be cached on disk per segment
hash so repeated calls don't re-hit the LLM.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ExplanationResult:
    summary: str
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    subscores: dict[str, float] = field(default_factory=dict)
    evidence: dict[str, list[str]] = field(default_factory=dict)
    suggested_title: str | None = None
    suggested_description: str | None = None
    suggested_hashtags: list[str] = field(default_factory=list)
    suggested_platforms: list[str] = field(default_factory=list)
    confidence: float = 0.5


class SegmentExplainer:
    """Generates explainable-AI reports for segments."""

    _instance: "SegmentExplainer | None" = None

    @classmethod
    def get_instance(cls) -> "SegmentExplainer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def explain(self, segment: Any) -> ExplanationResult:
        """Produce an ExplanationResult for a Segment model instance.

        `segment` is expected to have at minimum:
          - score_total (or score.total)
          - start_time / end_time
          - transcript (or transcript_text, transcript.text)
          - score_tags (or tags)
          - optional: score_hook, score_payoff, etc. (0-100)

        Pulls LLM polish if Ollama is available, otherwise templated.
        """
        # Step 1: extract signal fields defensively
        score_total = _coalesce(segment, ["score_total", "score.total", "scoreTotal"], default=0.0)
        duration = _coalesce(segment, ["duration"], default=None)
        if duration is None:
            start = _coalesce(segment, ["start_time", "startTime"], default=0.0) or 0.0
            end = _coalesce(segment, ["end_time", "endTime"], default=0.0) or 0.0
            duration = max(0.0, float(end) - float(start))

        transcript = _coalesce(
            segment,
            ["transcript", "transcript_text", "transcript.text"],
            default="",
        )
        if not isinstance(transcript, str):
            transcript = str(transcript or "")

        tags = _coalesce(segment, ["score_tags", "tags"], default=[]) or []

        # Additional signals — from score_* sub-fields on the Segment model
        # These are already 0-100 (per virality.py). We also pass raw floats
        # for any code that might expect 0-1 values.
        hook_strength = _coalesce(
            segment,
            ["score_hook", "hook_strength", "score.hookStrength"],
            default=None,
        )
        audio_energy = _coalesce(
            segment,
            ["score_rhythm", "audio_energy", "energy", "score.rhythm"],
            default=None,
        )
        face_pct = _coalesce(segment, ["face_visible_pct", "face_pct"], default=None)
        humour = _coalesce(
            segment,
            ["score_humour", "humour_reaction", "humour_score", "score.humourReaction"],
            default=None,
        )
        clarity = _coalesce(
            segment,
            ["score_clarity", "clarity_autonomy", "clarity_score", "score.clarityAutonomy"],
            default=None,
        )
        payoff = _coalesce(
            segment,
            ["score_payoff", "score.payoff"],
            default=None,
        )

        # Step 2: derive subscores (bounded 0-100)
        subscores = self._compute_subscores(
            score_total=score_total,
            duration=duration,
            hook=hook_strength,
            audio=audio_energy,
            face=face_pct,
            humour=humour,
            clarity=clarity,
            payoff=payoff,
            transcript=transcript,
        )

        # Step 3: derive evidence
        evidence = self._build_evidence(
            duration=duration,
            transcript=transcript,
            hook=hook_strength,
            audio=audio_energy,
            face=face_pct,
            tags=tags,
        )

        # Step 4: strengths + weaknesses
        strengths = self._extract_strengths(subscores, evidence)
        weaknesses = self._extract_weaknesses(subscores, duration, transcript)

        # Step 5: suggested metadata
        suggested_platforms = self._suggest_platforms(duration, subscores)
        suggested_title, suggested_description, suggested_hashtags = (
            await self._suggest_metadata(transcript, tags)
        )

        # Step 6: optional LLM polish of summary
        summary = await self._polish_summary(
            score_total=float(score_total or 0.0),
            subscores=subscores,
            strengths=strengths,
            duration=duration,
            transcript=transcript,
        )

        confidence = 0.85 if score_total and subscores else 0.5

        return ExplanationResult(
            summary=summary,
            strengths=strengths,
            weaknesses=weaknesses,
            subscores=subscores,
            evidence=evidence,
            suggested_title=suggested_title,
            suggested_description=suggested_description,
            suggested_hashtags=suggested_hashtags,
            suggested_platforms=suggested_platforms,
            confidence=confidence,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _compute_subscores(
        self,
        *,
        score_total: float,
        duration: float,
        hook: float | None,
        audio: float | None,
        face: float | None,
        humour: float | None,
        clarity: float | None,
        payoff: float | None,
        transcript: str,
    ) -> dict[str, float]:
        """Produce 8 subscores in 0-100 range."""
        def _clip(v: float) -> float:
            return max(0.0, min(100.0, float(v)))

        # Hook: if raw (0-1), rescale; else take as-is; else derive from density
        if hook is not None:
            hook_score = _clip(hook * 100) if hook <= 1.5 else _clip(hook)
        else:
            first = transcript[:60] if transcript else ""
            hook_score = 55 + min(25, len(first) * 0.4)
            if any(m in first.lower() for m in ("!", "?", "non", "quoi", "wow", "putain", "incroyable")):
                hook_score = min(95.0, hook_score + 15)

        # Payoff: use model field if available; else favor 15-45s duration
        if payoff is not None:
            payoff_score = _clip(payoff * 100) if payoff <= 1.5 else _clip(payoff)
        else:
            if 20 <= duration <= 50:
                payoff_score = 85.0
            elif 45 < duration <= 75:
                payoff_score = 75.0
            elif 10 <= duration < 20:
                payoff_score = 65.0
            else:
                payoff_score = 55.0

        # Clarity: use clarity_autonomy if available, else transcript density proxy
        if clarity is not None:
            clarity_score = _clip(clarity * 100) if clarity <= 1.5 else _clip(clarity)
        else:
            words = len(transcript.split())
            wps = words / max(1.0, duration)
            clarity_score = _clip(55 + min(35, wps * 10))

        # Energy: audio energy (0-1) → 0-100
        if audio is not None:
            energy_score = _clip(audio * 100) if audio <= 1.5 else _clip(audio)
        else:
            energy_score = 60.0

        # Face visibility 0-1
        if face is not None:
            face_score = _clip(face * 100) if face <= 1.5 else _clip(face)
        else:
            face_score = 50.0

        # Pacing: approximate from duration + transcript density
        pacing_score = (payoff_score + clarity_score) / 2

        # Humour/emotional: humour_reaction 0-1 or tag-based boost
        if humour is not None:
            humour_score = _clip(humour * 100) if humour <= 1.5 else _clip(humour)
        else:
            humour_score = 50.0
        if transcript and any(
            "humour" in w or "drole" in w or "drôle" in w
            for w in transcript.lower().split()
        ):
            humour_score = min(95.0, humour_score + 10)

        # Platform fit: derived composite
        platform_score = (hook_score * 0.4 + payoff_score * 0.3 + face_score * 0.3)

        return {
            "hook": round(hook_score, 1),
            "payoff": round(payoff_score, 1),
            "clarity": round(clarity_score, 1),
            "energy": round(energy_score, 1),
            "facecam": round(face_score, 1),
            "pacing": round(pacing_score, 1),
            "humour": round(humour_score, 1),
            "platform_fit": round(platform_score, 1),
            "overall": (
                round(float(score_total), 1)
                if score_total
                else round(
                    (hook_score + payoff_score + clarity_score + energy_score) / 4,
                    1,
                )
            ),
        }

    def _build_evidence(
        self,
        *,
        duration: float,
        transcript: str,
        hook: float | None,
        audio: float | None,
        face: float | None,
        tags: list[str],
    ) -> dict[str, list[str]]:
        ev: dict[str, list[str]] = {"transcript": [], "audio": [], "visual": [], "temporal": []}

        if transcript:
            first = transcript[:80].strip()
            if first:
                ev["transcript"].append(f"Ouverture : « {first}… »")
            word_count = len(transcript.split())
            if word_count >= 30:
                ev["transcript"].append(f"Discours dense : ~{word_count} mots sur {duration:.0f}s")

        if hook is not None and hook > 0:
            v = hook * 100 if hook <= 1.5 else hook
            if v >= 75:
                ev["temporal"].append(f"Accroche forte dans les 3 premières secondes (hook={v:.0f})")

        if audio is not None:
            v = audio * 100 if audio <= 1.5 else audio
            if v >= 70:
                ev["audio"].append(f"Pic d'énergie audio significatif ({v:.0f}%)")
            elif v <= 30:
                ev["audio"].append(f"Niveau audio faible ({v:.0f}%) — possible passage calme")

        if face is not None:
            v = face * 100 if face <= 1.5 else face
            if v >= 70:
                ev["visual"].append(f"Facecam visible {v:.0f}% du segment")
            elif v <= 30:
                ev["visual"].append(f"Facecam peu présente ({v:.0f}%)")

        if 20 <= duration <= 50:
            ev["temporal"].append(f"Durée optimale pour TikTok/Shorts ({duration:.0f}s)")
        elif duration > 75:
            ev["temporal"].append(f"Un peu long pour du court format ({duration:.0f}s)")

        if tags:
            top = [t for t in tags if t][:3]
            if top:
                ev["transcript"].append(f"Tags détectés : {', '.join(top)}")

        # Remove empty categories
        return {k: v for k, v in ev.items() if v}

    def _extract_strengths(
        self,
        subscores: dict[str, float],
        evidence: dict[str, list[str]],
    ) -> list[str]:
        out: list[str] = []
        ranked = sorted(subscores.items(), key=lambda kv: kv[1], reverse=True)
        labels = {
            "hook": "Accroche puissante dans les premières secondes",
            "payoff": "Payoff bien positionné dans la durée",
            "clarity": "Discours clair et autonome",
            "energy": "Énergie audio soutenue",
            "facecam": "Face-cam visible et engageante",
            "pacing": "Rythme adapté au format court",
            "humour": "Contenu à fort potentiel émotionnel",
            "platform_fit": "Profil idéal pour TikTok/Shorts",
        }
        for key, value in ranked:
            if value >= 75 and key in labels:
                out.append(labels[key])
            if len(out) >= 4:
                break

        # Pull 1-2 evidence bullets as extra strengths
        for category in ("transcript", "audio", "visual", "temporal"):
            for e in evidence.get(category, [])[:1]:
                if e not in out and len(out) < 5:
                    out.append(e)
        return out

    def _extract_weaknesses(
        self,
        subscores: dict[str, float],
        duration: float,
        transcript: str,
    ) -> list[str]:
        out: list[str] = []
        if subscores.get("clarity", 100) < 55:
            out.append("Contexte peu clair sans les secondes précédentes")
        if subscores.get("facecam", 100) < 40:
            out.append("Face-cam peu visible — engagement facial limité")
        if subscores.get("hook", 100) < 55:
            out.append("Accroche un peu tiède — première phrase à retravailler")
        if duration > 75:
            out.append("Segment long pour un format vertical court")
        elif duration < 10:
            out.append("Segment très court — limite la narration")
        if transcript and len(transcript.split()) < 8:
            out.append("Transcription très courte — peu de sous-titres à afficher")
        return out[:3]

    def _suggest_platforms(
        self, duration: float, subscores: dict[str, float]
    ) -> list[str]:
        out: list[str] = []
        if duration <= 60 and subscores.get("hook", 0) >= 70:
            out.append("tiktok")
        if duration <= 60:
            out.append("youtube_shorts")
        if 10 <= duration <= 90:
            out.append("instagram_reels")
        if duration <= 140:
            out.append("twitter")
        return out or ["tiktok"]

    async def _suggest_metadata(
        self, transcript: str, tags: list[str]
    ) -> tuple[str | None, str | None, list[str]]:
        """Ask LLM for a title/desc/hashtags, fall back to templates."""
        if not transcript:
            return (
                "Moment viral à ne pas rater 🔥",
                "Un instant capturé en temps réel.",
                ["#viral", "#fyp", "#clip"],
            )

        try:
            from forge_engine.services.llm_local import LocalLLMService
            llm = LocalLLMService.get_instance()
            if await llm.check_availability():
                result = await llm.generate_content(
                    transcript=transcript[:1200],
                    segment_tags=tags,
                    platform="tiktok",
                )
                if result and result.titles:
                    return (
                        result.titles[0],
                        result.description,
                        result.hashtags[:10] if result.hashtags else [],
                    )
        except Exception as e:
            logger.debug("LLM suggest_metadata failed: %s", e)

        # Fallback
        first_phrase = transcript.split(".")[0].strip()[:60]
        title = f"{first_phrase} 🔥" if first_phrase else "Moment viral à ne pas rater 🔥"
        description = first_phrase or "Un instant capturé en temps réel."
        hashtags = ["#viral", "#fyp", "#clip"]
        for t in tags[:3]:
            if t:
                hashtags.append(f"#{str(t).replace(' ', '').lower()}")
        return title, description, hashtags

    async def _polish_summary(
        self,
        *,
        score_total: float,
        subscores: dict[str, float],
        strengths: list[str],
        duration: float,
        transcript: str,
    ) -> str:
        """Generate one-line natural summary via LLM, fallback templated."""
        # Try LLM
        try:
            from forge_engine.services.llm_local import LocalLLMService
            llm = LocalLLMService.get_instance()
            if await llm.check_availability():
                prompt = (
                    f"En UNE phrase française concise (max 25 mots), explique pourquoi "
                    f"ce segment a un score de viralité de {score_total:.0f}/100. "
                    f"Points forts détectés : {', '.join(strengths[:3]) if strengths else 'aucun'}. "
                    f"Durée : {duration:.0f}s. "
                    f"Transcript (début) : « {transcript[:150]} »"
                )
                resp = await llm.generate(
                    prompt=prompt,
                    system="Tu es un expert en clips viraux. Réponse en 1 phrase française concise.",
                    max_tokens=120,
                    temperature=0.4,
                )
                if resp:
                    line = resp.strip().split("\n")[0].strip(' "\'')
                    if line:
                        return line[:240]
        except Exception as e:
            logger.debug("LLM summary polish failed: %s", e)

        # Fallback: template
        top_signal = max(subscores.items(), key=lambda kv: kv[1])[0] if subscores else "hook"
        signal_text = {
            "hook": "l'accroche puissante dès les premières secondes",
            "payoff": "un payoff bien placé dans la durée",
            "clarity": "un discours clair et autonome",
            "energy": "une énergie audio soutenue",
            "facecam": "une face-cam très présente",
            "pacing": "un rythme parfait pour le format court",
            "humour": "un potentiel émotionnel fort",
            "platform_fit": "un profil idéal pour les plateformes court format",
        }.get(top_signal, "plusieurs signaux convergents")
        return (
            f"Score {score_total:.0f}/100 porté principalement par {signal_text}, "
            f"sur une durée de {duration:.0f}s."
        )


def _coalesce(obj: Any, paths: list[str], default: Any = None) -> Any:
    """Get the first non-None attribute along a list of dotted paths."""
    for p in paths:
        try:
            val: Any = obj
            for key in p.split("."):
                if val is None:
                    break
                if isinstance(val, dict):
                    val = val.get(key)
                else:
                    val = getattr(val, key, None)
            if val is not None:
                return val
        except Exception:
            continue
    return default
