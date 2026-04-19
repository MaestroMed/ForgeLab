"""Tests for core/security.validate_source_path."""

from pathlib import Path

import pytest

from forge_engine.core.security import (
    SourcePathError,
    allowed_import_roots,
    validate_source_path,
)


def test_rejects_empty_and_whitespace():
    with pytest.raises(SourcePathError):
        validate_source_path("")
    with pytest.raises(SourcePathError):
        validate_source_path("   ")


def test_rejects_control_characters():
    with pytest.raises(SourcePathError):
        validate_source_path("/tmp/video.mp4\x00../../etc/passwd")


def test_rejects_missing_file(tmp_path: Path):
    missing = tmp_path / "does-not-exist.mp4"
    with pytest.raises(SourcePathError):
        validate_source_path(str(missing))


def test_rejects_directory(tmp_path: Path, monkeypatch):
    # Ensure the dir is inside an allowed root so we only fail on file-type.
    monkeypatch.setenv("FORGE_ALLOWED_IMPORT_ROOTS", str(tmp_path))
    with pytest.raises(SourcePathError):
        validate_source_path(str(tmp_path))


def test_rejects_outside_allowed_roots(tmp_path: Path, monkeypatch):
    # Point the allowlist somewhere else so tmp_path is outside it.
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.setenv("FORGE_ALLOWED_IMPORT_ROOTS", str(elsewhere))
    # Also stub HOME and LIBRARY_PATH to not cover tmp_path.
    monkeypatch.setattr("forge_engine.core.security.Path.home", classmethod(lambda cls: elsewhere))
    monkeypatch.setattr(
        "forge_engine.core.security.settings.LIBRARY_PATH",
        elsewhere,
    )
    video = tmp_path / "forbidden.mp4"
    video.write_bytes(b"\x00")
    with pytest.raises(SourcePathError):
        validate_source_path(str(video))


def test_accepts_file_inside_allowed_root(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FORGE_ALLOWED_IMPORT_ROOTS", str(tmp_path))
    video = tmp_path / "ok.mp4"
    video.write_bytes(b"\x00")
    resolved = validate_source_path(str(video))
    assert resolved == video.resolve()
    assert resolved.is_file()


def test_resolves_symlink_into_disallowed_location(tmp_path: Path, monkeypatch):
    allowed = tmp_path / "allowed"
    disallowed = tmp_path / "secret"
    allowed.mkdir()
    disallowed.mkdir()
    target = disallowed / "secret.mp4"
    target.write_bytes(b"\x00")
    link = allowed / "link.mp4"
    try:
        link.symlink_to(target)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks not supported on this platform")

    monkeypatch.setenv("FORGE_ALLOWED_IMPORT_ROOTS", str(allowed))
    monkeypatch.setattr("forge_engine.core.security.Path.home", classmethod(lambda cls: allowed))
    monkeypatch.setattr(
        "forge_engine.core.security.settings.LIBRARY_PATH",
        allowed,
    )

    # link.resolve() follows the symlink and lands outside the allowlist —
    # validation must reject even though the link itself is "in" the allowed
    # directory.
    with pytest.raises(SourcePathError):
        validate_source_path(str(link))


def test_allowed_roots_includes_library_and_home():
    roots = allowed_import_roots()
    assert roots  # non-empty
    # All entries should be resolved absolute paths.
    for root in roots:
        assert root.is_absolute()
