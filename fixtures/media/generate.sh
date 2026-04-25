#!/usr/bin/env bash
# Generate golden media fixtures for FORGE smoke tests.
set -e
cd "$(dirname "$0")"

echo "Generating 10s_testpattern.mp4..."
ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=10" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       10s_testpattern.mp4 2>/dev/null

echo "Generating 30s_silent_black.mp4..."
ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:d=30:r=30" \
       -f lavfi -i "anullsrc=r=48000:cl=stereo:d=30" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       30s_silent_black.mp4 2>/dev/null

echo "Generating 60s_vertical_9x16.mp4..."
ffmpeg -y -f lavfi -i "testsrc=duration=60:size=1080x1920:rate=30" \
       -f lavfi -i "sine=frequency=880:duration=60" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       60s_vertical_9x16.mp4 2>/dev/null

echo "Done. Fixtures in $(pwd):"
ls -lh *.mp4
