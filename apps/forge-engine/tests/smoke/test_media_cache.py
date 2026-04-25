"""Smoke test for media_cache — content-addressed storage."""

import sys
from pathlib import Path

# Make forge_engine importable when pytest is invoked from the repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))


def test_hash_and_store_roundtrip(tmp_path, monkeypatch):
    """Hashing + storing + retrieving round-trips cleanly and dedupes."""
    # Point media_cache at an isolated tmp dir
    from forge_engine.core.config import settings
    monkeypatch.setattr(settings, "LIBRARY_PATH", tmp_path)

    # Re-import to pick up the monkey-patched path
    import importlib
    import forge_engine.services.media_cache as media_cache
    importlib.reload(media_cache)

    src = tmp_path / "sample.bin"
    src.write_bytes(b"forge-lab test payload " * 1024)

    sha, dest = media_cache.store(src, "sample.bin")
    assert len(sha) == 64
    assert dest.exists()
    assert dest.stat().st_size == src.stat().st_size

    # Calling store again dedups
    sha2, dest2 = media_cache.store(src, "sample.bin")
    assert sha == sha2
    assert dest == dest2

    # get_cached returns the same path
    cached = media_cache.get_cached(sha, "sample.bin")
    assert cached == dest


def test_hash_deterministic(tmp_path):
    from forge_engine.services.media_cache import hash_file_sha256

    p = tmp_path / "x.bin"
    p.write_bytes(b"a" * 100_000)
    h1 = hash_file_sha256(p)
    h2 = hash_file_sha256(p)
    assert h1 == h2
    assert len(h1) == 64
