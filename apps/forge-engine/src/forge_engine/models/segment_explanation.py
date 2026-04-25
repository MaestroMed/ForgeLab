"""Segment explanation — why this clip scored what it scored."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text

from forge_engine.core.database import Base


class SegmentExplanation(Base):
    """Human-readable, evidence-backed explanation of a segment's score.

    Key differentiator: instead of an opaque score=92, we expose the signals
    and evidence that drove the score, plus suggested publication metadata.
    """

    __tablename__ = "segment_explanations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    segment_id = Column(
        String(36),
        ForeignKey("segments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    summary = Column(Text, nullable=True)

    # JSON lists of strings
    strengths_json = Column(Text, nullable=True)
    weaknesses_json = Column(Text, nullable=True)

    # {"transcript": [...], "audio": [...], "visual": [...], "temporal": [...]}
    evidence_json = Column(Text, nullable=True)

    # {"hook": 94, "payoff": 88, "clarity": 81, ...}
    subscores_json = Column(Text, nullable=True)

    suggested_title = Column(Text, nullable=True)
    suggested_description = Column(Text, nullable=True)
    suggested_hashtags_json = Column(Text, nullable=True)
    suggested_platforms_json = Column(Text, nullable=True)

    confidence = Column(Float, default=0.5)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        def _parse(v, default=None):
            if not v:
                return default
            try:
                return json.loads(v)
            except Exception:
                return default
        return {
            "id": self.id,
            "segment_id": self.segment_id,
            "summary": self.summary,
            "strengths": _parse(self.strengths_json, []),
            "weaknesses": _parse(self.weaknesses_json, []),
            "evidence": _parse(self.evidence_json, {}),
            "subscores": _parse(self.subscores_json, {}),
            "suggested_title": self.suggested_title,
            "suggested_description": self.suggested_description,
            "suggested_hashtags": _parse(self.suggested_hashtags_json, []),
            "suggested_platforms": _parse(self.suggested_platforms_json, []),
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
