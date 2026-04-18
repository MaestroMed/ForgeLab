#!/usr/bin/env bash
# Probe the installed FFmpeg for NVENC, libass, and subtitles-filter support.
# Mirrors scripts/check-ffmpeg.ps1.

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not in PATH. Install:"
  echo "  macOS:  brew install ffmpeg"
  echo "  Debian: sudo apt-get install ffmpeg"
  exit 1
fi

echo "[FFmpeg]"
echo "  Location: $(command -v ffmpeg)"
ffmpeg -version 2>&1 | head -n1 | sed 's/^/  /'

echo ""
echo "[NVENC Support]"
encoders=$(ffmpeg -hide_banner -encoders 2>&1 || true)
if grep -q "h264_nvenc" <<<"$encoders"; then
  echo "  h264_nvenc: available"
else
  echo "  h264_nvenc: NOT available (falling back to libx264)"
fi
if grep -q "hevc_nvenc" <<<"$encoders"; then
  echo "  hevc_nvenc: available"
else
  echo "  hevc_nvenc: NOT available"
fi

echo ""
echo "[Subtitle Filters]"
filters=$(ffmpeg -hide_banner -filters 2>&1 || true)
if grep -qE "^\s*T?\s+ass\b" <<<"$filters"; then
  echo "  ass:       available"
else
  echo "  ass:       NOT available"
fi
if grep -qE "^\s*T?\s+subtitles\b" <<<"$filters"; then
  echo "  subtitles: available"
else
  echo "  subtitles: NOT available"
fi

echo ""
if command -v ffprobe >/dev/null 2>&1; then
  echo "[FFprobe] available"
else
  echo "[FFprobe] NOT found (usually bundled with ffmpeg)"
fi
