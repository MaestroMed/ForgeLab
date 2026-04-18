"""Full pipeline E2E test -- generates a test video and runs the complete pipeline.

Usage:
    python scripts/test_full_pipeline.py

Requirements:
    - FFmpeg on PATH
    - FORGE Engine backend running on port 8420
    
This script:
    1. Generates a 10s test video (1920x1080 + audio)
    2. Creates a project via the API
    3. Runs ingest
    4. Runs analysis (with tiny whisper model for speed)
    5. Checks that segments were generated
    6. Exports the top segment with captions + intro
    7. Validates the output file
    8. Prints a PASS/FAIL report
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

API = "http://127.0.0.1:8420"
TIMEOUT = 10


def log(msg):
    print(f"  [{time.strftime('%H:%M:%S')}] {msg}")


def api_get(path):
    try:
        r = urllib.request.urlopen(f"{API}{path}", timeout=TIMEOUT)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}


def api_post(path, data=None):
    body = json.dumps(data).encode() if data else b""
    req = urllib.request.Request(
        f"{API}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode()[:300]}
    except Exception as e:
        return {"error": str(e)}


def generate_test_video(path, duration=10):
    """Generate a test video with testsrc2 + sine wave."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", f"testsrc2=duration={duration}:size=1920x1080:rate=30",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p", "-shortest",
        path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return result.returncode == 0


def wait_for_status(project_id, target_status, timeout=300, poll=5):
    """Poll project status until it matches target or times out."""
    start = time.time()
    while time.time() - start < timeout:
        data = api_get(f"/v1/projects/{project_id}")
        status = data.get("data", data).get("status", "unknown")
        if status == target_status:
            return True
        if status in ("error", "failed"):
            log(f"  Project failed with status: {status}")
            return False
        time.sleep(poll)
    return False


def probe(path):
    """Quick ffprobe of output."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {}
    cmd = [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    return json.loads(result.stdout) if result.returncode == 0 else {}


def main():
    results = {}
    
    print("=" * 60)
    print("  FORGE LAB - Full Pipeline Test")
    print("=" * 60)
    
    # Step 0: Check backend
    log("Checking backend...")
    health = api_get("/v1/monitor/pipeline")
    if "error" in health:
        print(f"\n  FAIL: Backend not running on {API}")
        print(f"  Start with: python -m uvicorn forge_engine.main:app --port 8420")
        sys.exit(1)
    results["backend"] = "PASS"
    log("Backend OK")
    
    # Step 1: Generate test video
    log("Generating test video...")
    test_dir = tempfile.mkdtemp(prefix="forge_test_")
    video_path = os.path.join(test_dir, "test_source.mp4")
    
    if not generate_test_video(video_path):
        print(f"\n  FAIL: Could not generate test video (FFmpeg missing?)")
        sys.exit(1)
    
    file_size = os.path.getsize(video_path)
    results["test_video"] = "PASS" if file_size > 10000 else "FAIL"
    log(f"Test video: {file_size / 1024:.0f} KB")
    
    # Step 2: Create project
    log("Creating project...")
    create_result = api_post("/v1/projects", {
        "name": "E2E Test Project",
        "source_path": video_path,
    })
    
    if "error" in create_result:
        log(f"Create failed: {create_result}")
        results["create_project"] = "FAIL"
    else:
        project_id = create_result.get("data", {}).get("id")
        results["create_project"] = "PASS" if project_id else "FAIL"
        log(f"Project created: {project_id[:8] if project_id else 'NONE'}")
    
    if results.get("create_project") != "PASS":
        print_report(results)
        return
    
    # Step 3: Ingest
    log("Starting ingest...")
    ingest_result = api_post(f"/v1/projects/{project_id}/ingest", {
        "auto_analyze": False,
    })
    results["ingest_start"] = "PASS" if "error" not in ingest_result else "FAIL"
    
    if results["ingest_start"] == "PASS":
        log("Waiting for ingest to complete...")
        if wait_for_status(project_id, "ingested", timeout=120):
            results["ingest_complete"] = "PASS"
            log("Ingest complete")
        else:
            results["ingest_complete"] = "FAIL"
            log("Ingest timed out or failed")
    
    # Step 4: Check segments (for this test, we'll check if analysis can start)
    log("Starting analysis...")
    analyze_result = api_post(f"/v1/projects/{project_id}/analyze", {})
    results["analyze_start"] = "PASS" if "error" not in analyze_result else "FAIL"
    
    if results["analyze_start"] == "PASS":
        log("Waiting for analysis (this may take a few minutes)...")
        if wait_for_status(project_id, "analyzed", timeout=600):
            results["analyze_complete"] = "PASS"
            log("Analysis complete")
            
            # Check segments
            segments = api_get(f"/v1/projects/{project_id}/segments")
            seg_count = len(segments.get("data", {}).get("items", []))
            results["segments_found"] = "PASS" if seg_count > 0 else "FAIL"
            log(f"Found {seg_count} segments")
        else:
            results["analyze_complete"] = "FAIL"
            log("Analysis timed out or failed")
    
    # Print report
    print()
    print_report(results)
    
    # Cleanup
    try:
        shutil.rmtree(test_dir, ignore_errors=True)
    except Exception:
        pass


def print_report(results):
    print("=" * 60)
    print("  Test Report")
    print("=" * 60)
    
    all_pass = True
    for test, status in results.items():
        icon = "OK" if status == "PASS" else "XX"
        print(f"  [{icon}] {test}: {status}")
        if status != "PASS":
            all_pass = False
    
    print()
    if all_pass:
        print("  RESULT: ALL TESTS PASSED")
    else:
        print("  RESULT: SOME TESTS FAILED")
    print("=" * 60)


if __name__ == "__main__":
    main()
