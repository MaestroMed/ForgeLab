"""Content-addressed media cache.

Hashes source files by SHA-256 and stores them in a sharded directory under
LIBRARY_PATH/media/sha256/ab/cd/..., enabling:
 - De-duplication of identical VODs
 - Reuse of audio/proxy across projects
 - Reproducible job inputs (hash-pinned)
"""

import hashlib
import logging
import shutil
import time
from pathlib import Path
from typing import Optional

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)


CACHE_ROOT = settings.LIBRARY_PATH / "media" / "sha256"


def _shard_path(sha256_hex: str, filename: str) -> Path:
    """Return the cache path for a given hash + filename.

    Files are sharded by the first 4 hex chars for filesystem performance:
    media/sha256/ab/cd/{full_hash}/{filename}
    """
    if len(sha256_hex) < 4:
        raise ValueError("sha256 hex too short")
    return CACHE_ROOT / sha256_hex[:2] / sha256_hex[2:4] / sha256_hex / filename


def hash_file_sha256(path: str | Path, chunk_size: int = 4 * 1024 * 1024) -> str:
    """Compute SHA-256 of a file, streaming in 4 MB chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def get_cached(sha256_hex: str, filename: str) -> Optional[Path]:
    """Return cached path if exists, else None."""
    p = _shard_path(sha256_hex, filename)
    return p if p.exists() and p.stat().st_size > 0 else None


def store(
    source_path: str | Path,
    filename: str,
    sha256_hex: Optional[str] = None,
) -> tuple[str, Path]:
    """Copy source into the cache, return (sha256, cached_path).

    Reuses the existing cached file if the hash already exists (dedup).
    """
    if sha256_hex is None:
        sha256_hex = hash_file_sha256(source_path)

    dest = _shard_path(sha256_hex, filename)
    if dest.exists() and dest.stat().st_size > 0:
        logger.debug("media_cache hit: %s", dest)
        return sha256_hex, dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    shutil.copy2(source_path, tmp)
    tmp.replace(dest)
    logger.info(
        "media_cache store %s: %.1f MB",
        sha256_hex[:12],
        dest.stat().st_size / 1e6,
    )
    return sha256_hex, dest


def cache_stats() -> dict:
    """Return quick stats for admin UI."""
    if not CACHE_ROOT.exists():
        return {"file_count": 0, "total_bytes": 0}
    total = 0
    count = 0
    for p in CACHE_ROOT.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
            count += 1
    return {"file_count": count, "total_bytes": total}


def garbage_collect(max_age_days: int = 30) -> int:
    """Delete cached files older than max_age_days. Returns count deleted.

    TODO: a proper GC would query the DB for actively-referenced hashes.
    This simple version only uses mtime.
    """
    if not CACHE_ROOT.exists():
        return 0
    now = time.time()
    cutoff = now - max_age_days * 86400
    deleted = 0
    for p in CACHE_ROOT.rglob("*"):
        if p.is_file() and p.stat().st_mtime < cutoff:
            try:
                p.unlink()
                deleted += 1
            except Exception:
                pass
    return deleted
