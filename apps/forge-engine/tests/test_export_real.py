"""Real FFmpeg integration tests for the export pipeline.

These tests generate an actual test video and run FFmpeg operations on it.
They require FFmpeg to be installed and available on PATH.

Run with: pytest tests/test_export_real.py -v -s
"""

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

# Skip all if FFmpeg not available
FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
pytestmark = pytest.mark.skipif(
    not FFMPEG, reason="FFmpeg not installed"
)


def generate_test_video(output_path: str, duration: float = 5.0, width: int = 1920, height: int = 1080):
    """Generate a test video with color bars + sine wave audio."""
    cmd = [
        FFMPEG, "-y",
        "-f", "lavfi", "-i", f"testsrc2=duration={duration}:size={width}x{height}:rate=30",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, f"Failed to generate test video: {result.stderr[:300]}"


def probe_video(path: str) -> dict:
    """Probe a video file and return format/stream info."""
    cmd = [
        FFPROBE, "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, f"ffprobe failed: {result.stderr[:200]}"
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def test_video(tmp_path_factory):
    """Create a test video that persists for the entire module."""
    video_dir = tmp_path_factory.mktemp("test_video")
    video_path = str(video_dir / "test_source.mp4")
    generate_test_video(video_path, duration=8.0)
    return video_path


@pytest.fixture
def output_dir(tmp_path):
    """Temporary output directory for each test."""
    return tmp_path


class TestFFmpegRender:
    """Test actual FFmpeg rendering operations."""
    
    def test_source_video_valid(self, test_video):
        """Verify test video was generated correctly."""
        info = probe_video(test_video)
        assert float(info["format"]["duration"]) >= 7.0
        
        video_stream = next(s for s in info["streams"] if s["codec_type"] == "video")
        audio_stream = next(s for s in info["streams"] if s["codec_type"] == "audio")
        
        assert video_stream["width"] == 1920
        assert video_stream["height"] == 1080
        assert audio_stream["codec_name"] == "aac"
    
    def test_render_9x16_composition(self, test_video, output_dir):
        """Test rendering a 9:16 vertical clip from 16:9 source."""
        output = str(output_dir / "render_9x16.mp4")
        
        # Simulate facecam (top-right) + content (center) composition
        filter_complex = (
            "[0:v]crop=400:300:1500:0,scale=1080:768[facecam];"
            "[0:v]crop=1200:800:360:140,scale=1080:1152[content];"
            "[facecam][content]vstack=inputs=2[out];"
            "[out]scale=1080:1920:force_original_aspect_ratio=decrease,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30[final]"
        )
        
        cmd = [
            FFMPEG, "-y",
            "-ss", "1", "-i", test_video, "-t", "3",
            "-filter_complex", filter_complex,
            "-map", "[final]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, f"Render failed: {result.stderr[:500]}"
        
        info = probe_video(output)
        video = next(s for s in info["streams"] if s["codec_type"] == "video")
        assert video["width"] == 1080
        assert video["height"] == 1920
        assert float(info["format"]["duration"]) >= 2.5
    
    def test_jump_cut_hard(self, test_video, output_dir):
        """Test hard jump cuts via concat filter."""
        output = str(output_dir / "jumpcut_hard.mp4")
        
        # Keep 0-2s and 4-6s, cut 2-4s
        filter_complex = (
            "[0:v]trim=start=0:duration=2,setpts=PTS-STARTPTS[v0];"
            "[0:a]atrim=start=0:duration=2,asetpts=PTS-STARTPTS[a0];"
            "[0:v]trim=start=4:duration=2,setpts=PTS-STARTPTS[v1];"
            "[0:a]atrim=start=4:duration=2,asetpts=PTS-STARTPTS[a1];"
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"
        )
        
        cmd = [
            FFMPEG, "-y", "-i", test_video,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, f"Jump cut failed: {result.stderr[:500]}"
        
        info = probe_video(output)
        duration = float(info["format"]["duration"])
        assert 3.5 < duration < 4.5, f"Expected ~4s, got {duration}s"
    
    def test_intro_overlay_drawtext(self, test_video, output_dir):
        """Test intro overlay with blur + drawtext."""
        output = str(output_dir / "intro_overlay.mp4")
        
        # Find a font that works
        font_path = None
        for candidate in ["C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arial.ttf"]:
            if os.path.exists(candidate):
                font_path = candidate.replace("\\", "/").replace(":", "\\:")
                break
        
        if not font_path:
            pytest.skip("No Windows fonts found")
        
        filter_complex = (
            f"[0:v]format=yuv420p,split[blur_in][clean];"
            f"[blur_in]boxblur=15:5,format=yuv420p,"
            f"fade=t=out:st=1.5:d=0.5:alpha=1[blurred];"
            f"[clean][blurred]overlay=0:0:format=yuv420:enable='lte(t,2)'[bg];"
            f"[bg]drawtext=text='TEST TITLE':fontfile={font_path}:"
            f"fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h/2):"
            f"alpha='if(lt(t,0.5),t/0.5,if(lt(t,1.5),1,(2-t)/0.5))':"
            f"enable='lte(t,2)'[final]"
        )
        
        cmd = [
            FFMPEG, "-y",
            "-i", test_video,
            "-filter_complex", filter_complex,
            "-map", "[final]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-t", "5",
            output
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, f"Intro overlay failed: {result.stderr[:500]}"
        
        info = probe_video(output)
        assert float(info["format"]["duration"]) >= 4.0
    
    def test_cold_open_reorder(self, test_video, output_dir):
        """Test cold open timeline reorder: hook(4-6) -> start(0-4) -> rest(6-8)."""
        output = str(output_dir / "cold_open.mp4")
        
        filter_complex = (
            "[0:v]trim=start=4:end=6,setpts=PTS-STARTPTS[hookv];"
            "[0:a]atrim=start=4:end=6,asetpts=PTS-STARTPTS[hooka];"
            "[0:v]trim=start=0:end=4,setpts=PTS-STARTPTS[startv];"
            "[0:a]atrim=start=0:end=4,asetpts=PTS-STARTPTS[starta];"
            "[0:v]trim=start=6:end=8,setpts=PTS-STARTPTS[restv];"
            "[0:a]atrim=start=6:end=8,asetpts=PTS-STARTPTS[resta];"
            "[hookv][hooka][startv][starta][restv][resta]concat=n=3:v=1:a=1[outv][outa]"
        )
        
        cmd = [
            FFMPEG, "-y", "-i", test_video,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            output
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, f"Cold open failed: {result.stderr[:500]}"
        
        info = probe_video(output)
        duration = float(info["format"]["duration"])
        assert 7.0 < duration < 9.0, f"Expected ~8s, got {duration}s"
        
        has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
        assert has_audio, "Cold open output has no audio"
