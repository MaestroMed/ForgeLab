"""Render mode definitions — preview / draft / final."""

from dataclasses import dataclass
from enum import StrEnum


class RenderMode(StrEnum):
    PREVIEW = "preview"   # 360x640, ultrafast, no QC
    DRAFT = "draft"       # 720x1280, medium, no QC
    FINAL = "final"       # 1080x1920, full pipeline + QC + thumbnail


@dataclass(frozen=True)
class RenderModeConfig:
    width: int
    height: int
    fps: int
    crf: int
    preset: str
    run_qc: bool
    burn_subtitles: bool
    max_duration_seconds: float | None = None

    @classmethod
    def for_mode(cls, mode: RenderMode) -> "RenderModeConfig":
        if mode == RenderMode.PREVIEW:
            return cls(
                width=360, height=640, fps=24, crf=32,
                preset="ultrafast",
                run_qc=False, burn_subtitles=True,
                max_duration_seconds=20.0,  # Cap preview duration
            )
        if mode == RenderMode.DRAFT:
            return cls(
                width=720, height=1280, fps=30, crf=28,
                preset="medium",
                run_qc=False, burn_subtitles=True,
            )
        # FINAL
        return cls(
            width=1080, height=1920, fps=30, crf=23,
            preset="p5",  # NVENC Ada Lovelace sweet spot
            run_qc=True, burn_subtitles=True,
        )
