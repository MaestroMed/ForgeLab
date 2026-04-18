#!/usr/bin/env bash
# FORGE/LAB demo generator — creates a project from a VOD and renders the top N
# clips. Mirrors scripts/demo.ps1. Requires the engine to already be running
# (pnpm dev or similar).

set -euo pipefail

VIDEO_PATH=""
CLIP_COUNT=3
ENGINE_PORT="${FORGE_PORT:-7860}"

usage() {
  echo "Usage: $0 --video-path PATH [--clip-count N] [--port N]"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --video-path) VIDEO_PATH="$2"; shift 2 ;;
    --clip-count) CLIP_COUNT="$2"; shift 2 ;;
    --port)       ENGINE_PORT="$2"; shift 2 ;;
    -h|--help)    usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

if [[ -z "$VIDEO_PATH" ]]; then
  echo "Provide --video-path PATH." >&2
  usage
fi
if [[ ! -f "$VIDEO_PATH" ]]; then
  echo "Video not found: $VIDEO_PATH" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq / apt-get install jq)." >&2
  exit 1
fi

base="http://localhost:${ENGINE_PORT}"
if ! curl -sSf --max-time 3 "$base/health" >/dev/null; then
  echo "FORGE Engine not reachable on $base. Start it with: pnpm dev" >&2
  exit 1
fi

post() { curl -sSf -X POST -H "Content-Type: application/json" -d "$2" "$1"; }
get()  { curl -sSf "$1"; }

wait_job() {
  local job_id="$1"
  while :; do
    local status
    status=$(get "$base/v1/jobs/$job_id" | jq -r '.status // .data.status // empty')
    case "$status" in
      completed) return 0 ;;
      failed|cancelled)
        get "$base/v1/jobs/$job_id" | jq .
        return 1 ;;
    esac
    sleep 2
  done
}

echo "==> Creating project"
proj_resp=$(post "$base/v1/projects" "{\"name\":\"Demo $(date -Iseconds)\",\"source_path\":\"$VIDEO_PATH\"}")
project_id=$(echo "$proj_resp" | jq -r '.data.id // .id')
echo "  project_id=$project_id"

echo "==> Ingesting"
ingest_resp=$(post "$base/v1/projects/$project_id/ingest" '{"create_proxy":true,"extract_audio":true}')
ingest_job=$(echo "$ingest_resp" | jq -r '.data.jobId // .job_id')
wait_job "$ingest_job" || { echo "ingest failed"; exit 1; }

echo "==> Analyzing"
analyze_resp=$(post "$base/v1/projects/$project_id/analyze" '{"transcribe":true,"detect_scenes":true,"analyze_audio":true,"score_segments":true}')
analyze_job=$(echo "$analyze_resp" | jq -r '.data.jobId // .job_id')
wait_job "$analyze_job" || { echo "analyze failed"; exit 1; }

echo "==> Fetching top $CLIP_COUNT segments"
segments=$(get "$base/v1/projects/$project_id/segments?page=1&page_size=$CLIP_COUNT&sort_by=score&sort_order=desc")
segment_ids=$(echo "$segments" | jq -r '.data.items[].id')

echo "==> Exporting"
for seg in $segment_ids; do
  export_resp=$(post "$base/v1/projects/$project_id/export" "{\"segment_id\":\"$seg\",\"variant\":\"A\",\"include_captions\":true}")
  export_job=$(echo "$export_resp" | jq -r '.data.jobId // .job_id')
  if wait_job "$export_job"; then
    echo "  exported segment $seg"
  else
    echo "  export failed for $seg"
  fi
done

echo "==> Done. Artifacts:"
get "$base/v1/projects/$project_id/artifacts" | jq -r '.data[]?.path // .[]?.path'
