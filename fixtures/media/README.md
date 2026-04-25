# Golden media fixtures

Small synthetic videos for smoke-testing the FORGE pipeline. Generated on
the fly via FFmpeg so no binaries are committed to git.

## Generate locally

```bash
bash fixtures/media/generate.sh
```

Or manually:

```bash
# 10s 720p test pattern with counter + 440 Hz tone
ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=10" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       fixtures/media/10s_testpattern.mp4

# 30s silent black video (silence edge case)
ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:d=30:r=30" \
       -f lavfi -i "anullsrc=r=48000:cl=stereo:d=30" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       fixtures/media/30s_silent_black.mp4

# 60s vertical 9:16 fixture (platform-native input check)
ffmpeg -y -f lavfi -i "testsrc=duration=60:size=1080x1920:rate=30" \
       -f lavfi -i "sine=frequency=880:duration=60" \
       -c:v libx264 -preset ultrafast -crf 28 \
       -c:a aac -b:a 128k -shortest \
       fixtures/media/60s_vertical_9x16.mp4
```

## Usage

Smoke tests in `apps/forge-engine/tests/smoke/` reference these by relative
path. Generate them before running the tests:

```bash
cd D:/ViralDNAMap
bash fixtures/media/generate.sh
cd apps/forge-engine
.venv/Scripts/python.exe -m pytest tests/smoke/ -v
```
