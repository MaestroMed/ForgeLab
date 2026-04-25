"""Pipeline trace — per-stage timing telemetry."""

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from forge_engine.core.database import Base


class PipelineTrace(Base):
    """Per-stage telemetry for a job.

    One row per pipeline stage executed. The admin UI aggregates these into
    a flamegraph-style breakdown so you can see why a job took 2h instead
    of 30 min.
    """

    __tablename__ = "pipeline_traces"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    stage = Column(String(100), nullable=False)  # "whisper.transcribe", "ffmpeg.render"
    status = Column(String(20), default="ok")     # ok | error | skipped | cached
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    gpu_mem_mb = Column(Float, nullable=True)
    cpu_percent = Column(Float, nullable=True)
    cache_hit = Column(Integer, default=0)  # SQLite has no bool

    error_message = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "stage": self.stage,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_ms": self.duration_ms,
            "gpu_mem_mb": self.gpu_mem_mb,
            "cpu_percent": self.cpu_percent,
            "cache_hit": bool(self.cache_hit),
            "error_message": self.error_message,
            "details": json.loads(self.details_json) if self.details_json else None,
        }
