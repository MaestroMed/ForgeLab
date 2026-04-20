import { useEffect, useState, useRef } from 'react';
import { ENGINE_BASE_URL } from '@/lib/config';
import { useJobsStore } from '@/store';

/**
 * Cinema-mode ambient decoration: streams the FFmpeg log lines of the currently
 * running export/render job down the right edge of the screen — like subtle
 * machine credits. Invisible outside cinema mode.
 */
export default function FFmpegPoetry() {
  const [lines, setLines] = useState<string[]>([]);
  const [cinemaActive, setCinemaActive] = useState(false);
  const seenLines = useRef<Set<string>>(new Set());

  const activeJob = useJobsStore((s) =>
    s.jobs.find(
      (j) => j.status === 'running' && (j.type === 'export' || j.type === 'render_final'),
    ),
  );

  // Watch for the `cinema-mode` class on <body>.
  useEffect(() => {
    const update = () => setCinemaActive(document.body.classList.contains('cinema-mode'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Poll logs for the active job.
  useEffect(() => {
    if (!activeJob || !cinemaActive) {
      setLines([]);
      seenLines.current.clear();
      return;
    }
    let alive = true;
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${ENGINE_BASE_URL}/v1/jobs/${activeJob.id}/logs?lines=50`);
        const data = await res.json();
        const newLines: string[] = data?.data?.lines ?? data?.lines ?? [];
        if (!alive) return;
        const fresh = newLines.filter((l) => {
          if (seenLines.current.has(l)) return false;
          seenLines.current.add(l);
          return true;
        });
        if (fresh.length > 0) {
          setLines((prev) => [...prev, ...fresh].slice(-30));
        }
      } catch {
        /* ignore — engine may still be starting */
      }
    };
    fetchLogs();
    const iv = window.setInterval(fetchLogs, 1500);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [activeJob?.id, cinemaActive]);

  if (!cinemaActive || !activeJob || lines.length === 0) return null;

  // Only surface interesting lines — skip DEBUG noise.
  const visibleLines = lines.filter((l) => !l.includes('DEBUG')).slice(-10);

  return (
    <div className="fixed inset-y-0 right-0 w-64 pointer-events-none z-[15] overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-l from-black via-black/50 to-transparent" />
      <div
        className="absolute inset-0 flex flex-col-reverse px-4 py-8 text-[10px] font-mono text-viral-medium/40 tabular-nums"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 20%, black 70%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 20%, black 70%, transparent 100%)',
        }}
      >
        {visibleLines
          .slice()
          .reverse()
          .map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 20)}`}
              className="truncate mb-1"
              style={{ opacity: 1 - i * 0.08 }}
            >
              {line.length > 60 ? line.slice(-60) : line}
            </div>
          ))}
      </div>
    </div>
  );
}
