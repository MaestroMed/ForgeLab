"""Builds RenderRecipe rows from export requests + computes reproducibility hashes."""

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def normalize_recipe_payload(
    *,
    platform: str,
    layout: dict | None,
    caption_style: dict | None,
    intro: dict | None,
    audio: dict | None,
    jumpcut: dict | None,
) -> dict:
    """Return a canonical dict representation for hashing."""
    return {
        "platform": platform,
        "layout": layout or {},
        "caption_style": caption_style or {},
        "intro": intro or {},
        "audio": audio or {},
        "jumpcut": jumpcut or {},
    }


def compute_recipe_hash(payload: dict) -> str:
    """SHA-256 over the canonical JSON representation.

    Same recipe → same hash → can reuse cached output or detect duplicates.
    """
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def persist_recipe(
    db,
    *,
    project_id: str,
    segment_id: str | None,
    platform: str,
    layout: dict | None = None,
    caption_style: dict | None = None,
    intro: dict | None = None,
    audio: dict | None = None,
    jumpcut: dict | None = None,
    produced_artifact_id: str | None = None,
) -> tuple[Any, str]:
    """Persist a RenderRecipe row; returns (model, hash)."""
    from forge_engine.models.render_recipe import RenderRecipe

    payload = normalize_recipe_payload(
        platform=platform,
        layout=layout,
        caption_style=caption_style,
        intro=intro,
        audio=audio,
        jumpcut=jumpcut,
    )
    graph_hash = compute_recipe_hash(payload)

    row = RenderRecipe(
        project_id=project_id,
        segment_id=segment_id,
        platform=platform,
        layout_json=json.dumps(payload["layout"], ensure_ascii=False) if payload["layout"] else None,
        caption_style_json=json.dumps(payload["caption_style"], ensure_ascii=False) if payload["caption_style"] else None,
        intro_json=json.dumps(payload["intro"], ensure_ascii=False) if payload["intro"] else None,
        audio_json=json.dumps(payload["audio"], ensure_ascii=False) if payload["audio"] else None,
        jumpcut_json=json.dumps(payload["jumpcut"], ensure_ascii=False) if payload["jumpcut"] else None,
        ffmpeg_graph_hash=graph_hash,
        produced_artifact_id=produced_artifact_id,
    )
    db.add(row)
    await db.flush()
    logger.info("RenderRecipe persisted %s (hash=%s)", row.id[:8], graph_hash[:12])
    return row, graph_hash
