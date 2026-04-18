"""
Font resolution utility.
Prefers bundled fonts in resources/fonts/, falls back to system fonts.
Never fails silently — always returns a usable path.
"""
import platform
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Bundled fonts directory (relative to this file: ../../../../../../resources/fonts/)
# File lives at: apps/forge-engine/src/forge_engine/core/fonts.py
# Resources at:  apps/desktop/resources/fonts/ (shared across apps in the monorepo)
_BUNDLE_ROOT = (
    Path(__file__).parent  # core/
    .parent                # forge_engine/
    .parent                # src/
    .parent                # forge-engine/
    .parent                # apps/
    / "desktop"
    / "resources"
    / "fonts"
)

# Mapping: font name → bundled filename
BUNDLED_FONTS: dict[str, str] = {
    "Anton": "Anton-Regular.ttf",
    "Inter": "Inter-Bold.ttf",
    "Montserrat": "Montserrat-Bold.ttf",
    "SpaceGrotesk": "SpaceGrotesk-Bold.ttf",
}

SYSTEM_FALLBACKS: dict[str, list[str]] = {
    "Anton": ["Anton-Regular.ttf"],
    "Inter": ["Inter-Bold.ttf", "Inter.ttf", "arial.ttf", "Arial.ttf"],
    "Montserrat": ["Montserrat-Bold.ttf", "Montserrat.ttf", "arial.ttf"],
    "SpaceGrotesk": ["SpaceGrotesk-Bold.ttf", "arial.ttf"],
    # Legacy names used in intro.py
    "Space Grotesk": ["SpaceGrotesk-Bold.ttf", "SpaceGrotesk-SemiBold.ttf", "Space Grotesk Bold.ttf", "arial.ttf"],
    "Playfair Display": ["PlayfairDisplay-Bold.ttf", "Playfair Display Bold.ttf", "arial.ttf"],
    "Oswald": ["Oswald-Bold.ttf", "Oswald-SemiBold.ttf", "arial.ttf"],
    "Bebas Neue": ["BebasNeue-Regular.ttf", "BebasNeue-Bold.ttf", "arial.ttf"],
    "Arial": ["arial.ttf", "Arial.ttf", "arialbd.ttf"],
    "Impact": ["impact.ttf", "Impact.ttf"],
}

_SYSTEM_FONT_DIRS: list[Path] = {
    "Windows": [
        Path("C:/Windows/Fonts"),
        Path.home() / "AppData/Local/Microsoft/Windows/Fonts",
    ],
    "Darwin": [
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path.home() / "Library/Fonts",
    ],
    "Linux": [
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
        Path.home() / ".fonts",
    ],
}.get(platform.system(), [])


def resolve_font(name: str) -> Path:
    """
    Resolve a font by name to an absolute path.
    Priority: bundled → system → last-resort fallback.
    Never raises.
    """
    # 1. Check bundled fonts (try both the exact name key and common variations)
    for key in [name, name.replace(" ", "")]:
        bundled_name = BUNDLED_FONTS.get(key)
        if bundled_name:
            bundled = _BUNDLE_ROOT / bundled_name
            if bundled.exists():
                logger.debug("Using bundled font: %s -> %s", name, bundled)
                return bundled
            logger.debug("Bundled font not found on disk: %s", bundled)

    # 2. Check system fonts using fallback lists
    fallback_filenames = SYSTEM_FALLBACKS.get(name, [])
    if not fallback_filenames:
        # Build generic fallback list from font name
        base = name.replace(" ", "")
        fallback_filenames = [
            f"{base}-Bold.ttf",
            f"{base}-SemiBold.ttf",
            f"{base}-Regular.ttf",
            f"{base}.ttf",
            f"{name.lower().replace(' ', '-')}-bold.ttf",
        ]

    for filename in fallback_filenames:
        for font_dir in _SYSTEM_FONT_DIRS:
            candidate = font_dir / filename
            if candidate.exists():
                logger.debug("Using system font: %s -> %s", name, candidate)
                return candidate

    # 3. Last-resort: any common sans-serif on the system
    last_resort_names = [
        "arial.ttf", "Arial.ttf", "DejaVuSans.ttf",
        "LiberationSans-Regular.ttf", "FreeSans.ttf",
    ]
    for filename in last_resort_names:
        for font_dir in _SYSTEM_FONT_DIRS:
            candidate = font_dir / filename
            if candidate.exists():
                logger.warning(
                    "Font '%s' not found, using last-resort fallback: %s", name, candidate
                )
                return candidate

    # 4. Absolute fallback: return a path string that FFmpeg will attempt to resolve
    logger.error("No font found for '%s'; FFmpeg will use its default", name)
    return Path("Arial.ttf")


def resolve_font_ffmpeg(name: str) -> str:
    """
    Return the font path as an FFmpeg-compatible string.
    On Windows: forward-slashes with escaped colons (e.g. C\\:/Windows/Fonts/arial.ttf).
    On other platforms: plain path string (fontconfig handles it).
    """
    path = resolve_font(name)
    path_str = str(path).replace("\\", "/")
    if platform.system() == "Windows":
        path_str = path_str.replace(":", "\\:")
    return path_str
