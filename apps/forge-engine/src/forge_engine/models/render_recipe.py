"""Render recipe — reproducible export configuration."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from forge_engine.core.database import Base


class RenderRecipe(Base):
    """A reproducible recipe to render a segment into a specific platform clip.

    Stores the full configuration (layout, captions, audio, intro, jumpcuts)
    as JSON. A hash of the resulting FFmpeg filter_complex graph is included
    so duplicate renders can be detected/cached.
    """

    __tablename__ = "render_recipes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    segment_id = Column(String(36), ForeignKey("segments.id", ondelete="CASCADE"), nullable=True)

    # tiktok | youtube_shorts | instagram_reels | twitter | custom
    platform = Column(String(50), nullable=False, default="tiktok")

    # Configuration JSON (versioned inside the payload)
    recipe_version = Column(Integer, default=1)
    layout_json = Column(Text, nullable=True)
    caption_style_json = Column(Text, nullable=True)
    intro_json = Column(Text, nullable=True)
    audio_json = Column(Text, nullable=True)
    jumpcut_json = Column(Text, nullable=True)

    # Reproducibility hash — SHA256 of the normalized FFmpeg filter_complex + inputs
    ffmpeg_graph_hash = Column(String(64), nullable=True, index=True)

    # Optional link back to the artifact produced by this recipe
    produced_artifact_id = Column(String(36), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        def _parse(v):
            if not v:
                return None
            try:
                return json.loads(v)
            except Exception:
                return v
        return {
            "id": self.id,
            "project_id": self.project_id,
            "segment_id": self.segment_id,
            "platform": self.platform,
            "recipe_version": self.recipe_version,
            "layout": _parse(self.layout_json),
            "caption_style": _parse(self.caption_style_json),
            "intro": _parse(self.intro_json),
            "audio": _parse(self.audio_json),
            "jumpcut": _parse(self.jumpcut_json),
            "ffmpeg_graph_hash": self.ffmpeg_graph_hash,
            "produced_artifact_id": self.produced_artifact_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
