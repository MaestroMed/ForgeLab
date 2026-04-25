"""FORGE LAB 2.0 — Rendering domain (bounded context).

Three render modes with increasing quality/cost:
  - preview  → 360p, ultrafast, no QC, ~2-5s for a 30s clip
  - draft    → 720p, medium preset, no QC, ~10-20s
  - final    → 1080x1920, full pipeline + subtitles + QC + thumbnail

Each mode shares the same RenderRecipe so the output at any quality is
reproducible from the same recipe hash.
"""

from forge_engine.rendering.modes import RenderMode, RenderModeConfig

__all__ = ["RenderMode", "RenderModeConfig"]
