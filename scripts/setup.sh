#!/usr/bin/env bash
# FORGE/LAB setup for Linux / macOS. Mirrors scripts/setup.ps1.
# Requires: Node.js 18+, Python 3.11+, FFmpeg in PATH.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SKIP_PYTHON=0
SKIP_NODE=0
SKIP_FFMPEG=0
for arg in "$@"; do
  case "$arg" in
    --skip-python) SKIP_PYTHON=1 ;;
    --skip-node)   SKIP_NODE=1 ;;
    --skip-ffmpeg) SKIP_FFMPEG=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

echo "==> FORGE/LAB setup"

have() { command -v "$1" >/dev/null 2>&1; }

if [[ "$SKIP_NODE" -eq 0 ]]; then
  if have node; then
    echo "  Node.js $(node --version)"
  else
    echo "  Node.js not found. Install Node 18+ (https://nodejs.org)." >&2
    exit 1
  fi
fi

if have pnpm; then
  echo "  pnpm $(pnpm --version)"
else
  echo "  Installing pnpm via npm..."
  npm install -g pnpm
fi

if [[ "$SKIP_PYTHON" -eq 0 ]]; then
  PY=""
  for candidate in python3.11 python3.12 python3 python; do
    if have "$candidate"; then PY="$candidate"; break; fi
  done
  if [[ -z "$PY" ]]; then
    echo "  Python 3.11+ not found." >&2
    exit 1
  fi
  echo "  $($PY --version)"
fi

if [[ "$SKIP_FFMPEG" -eq 0 ]]; then
  if have ffmpeg; then
    echo "  $(ffmpeg -version | head -n1)"
  else
    echo "  FFmpeg not found. Install:" >&2
    echo "    macOS:  brew install ffmpeg" >&2
    echo "    Debian: sudo apt-get install ffmpeg" >&2
    echo "    Arch:   sudo pacman -S ffmpeg" >&2
    exit 1
  fi
fi

echo "==> Installing Node dependencies"
pnpm install

if [[ "$SKIP_PYTHON" -eq 0 ]]; then
  echo "==> Setting up Python venv"
  pushd "$REPO_ROOT/apps/forge-engine" >/dev/null
  if [[ ! -d .venv ]]; then
    "$PY" -m venv .venv
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
  deactivate
  popd >/dev/null
fi

echo ""
echo "Setup complete. Start dev with: pnpm dev"
