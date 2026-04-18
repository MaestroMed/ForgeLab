"""Quick monitoring script - run this to see live status.

Usage: python scripts/monitor.py
"""
import json
import time
import urllib.request
import sys

API = "http://127.0.0.1:8420"

def get(path, timeout=5):
    try:
        r = urllib.request.urlopen(f"{API}{path}", timeout=timeout)
        return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

def main():
    print("=" * 60)
    print("  FORGE LAB - Live Monitor")
    print("=" * 60)
    
    while True:
        # Projects
        projects = get("/v1/projects?page=1&page_size=3")
        items = projects.get("data", {}).get("items", [])
        
        print(f"\n[{time.strftime('%H:%M:%S')}] Projects:")
        for p in items[:3]:
            print(f"  {p['id'][:8]} | {p['status']:12s} | {p['name'][:45]}")
        
        # Pipeline
        pipeline = get("/v1/monitor/pipeline")
        if "data" in pipeline:
            ap = pipeline["data"]["autoPipeline"]
            sc = pipeline["data"]["publishScheduler"]
            print(f"\n  AutoPipeline: {'RUNNING' if ap['running'] else 'STOPPED'}")
            print(f"  Scheduler: {sc['postsToday']}/{sc['maxPostsPerDay']} posts today, next: {sc.get('nextSlot','?')}")
        
        # Pending clips
        queue = get("/v1/clips/queue/pending?channel=EtoStark")
        clips = queue.get("data", [])
        print(f"\n  Clips pending review: {len(clips)}")
        for c in clips[:5]:
            score = c.get("viralScore", 0)
            title = (c.get("title") or "Untitled")[:40]
            print(f"    [{score:.0f}] {title}")
        
        print(f"\n{'─' * 60}")
        print("  Ctrl+C to exit | Refreshing every 30s...")
        
        try:
            time.sleep(30)
        except KeyboardInterrupt:
            print("\nBye!")
            sys.exit(0)

if __name__ == "__main__":
    main()
