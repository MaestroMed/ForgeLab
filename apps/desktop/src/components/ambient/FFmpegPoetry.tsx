import { useEffect, useState, useRef } from 'react';
import { useJobsStore } from '@/store';
import { useJobLogStream } from '@/lib/hooks/useJobLogStream';

/**
 * Cinema-mode ambient decoration: streams the FFmpeg log lines of the currently
 * running export/render job down the right edge of the screen — like subtle
 * machine credits. Invisible outside cinema mode.
 */
export default function FFmpegPoetry() {
  const [lines, setLines] = useState<string[]>([]);
  const [cinemaActive, setCinemaActive] = useState(false);
  const seenLines = useRef<Set<string>>(new Set());
  const activeJobIdRef = useRef<string | undefined>(undefined);

  const activeJob = useJobsStore((s) =>
    s.jobs.find(
      (j) => j.status === 'running' && (j.type === 'export' || j.type === 'render_final'),
    ),
  );

  // Watch for the `cinema-mode` class on <body>. Filter by attributeName
  // so we don't re-read body.classList for every unrelated mutation.
  useEffect(() => {
    const update = () => setCinemaActive(document.body.classList.contains('cinema-mode'));
    update();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          update();
          break;
        }
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // SSE stream of log lines — near-zero latency. JobLogDrawer opens its
  // own EventSource when a user taps to tail; these two streams read from
  // the same in-memory ring buffer on the backend, so they stay in sync
  // without any client-side coordination. We still track `seenLines`
  // locally because we only surface newly-arrived lines as ambient text.
  const fetchedLines = useJobLogStream(
    activeJob?.id,
    Boolean(activeJob && cinemaActive),
  );

  // Reset the seen-set and buffer whenever the target job changes or the
  // cinema mode is toggled off.
  useEffect(() => {
    if (!activeJob || !cinemaActive) {
      setLines([]);
      seenLines.current.clear();
      activeJobIdRef.current = undefined;
      return;
    }
    if (activeJobIdRef.current !== activeJob.id) {
      seenLines.current.clear();
      setLines([]);
      activeJobIdRef.current = activeJob.id;
    }
  }, [activeJob?.id, cinemaActive, activeJob]);

  // Append newly-seen lines as they arrive from the shared query.
  useEffect(() => {
    if (!activeJob || !cinemaActive) return;
    const fresh = fetchedLines.filter((l) => {
      if (seenLines.current.has(l)) return false;
      seenLines.current.add(l);
      return true;
    });
    if (fresh.length > 0) {
      setLines((prev) => [...prev, ...fresh].slice(-30));
    }
  }, [fetchedLines, activeJob, cinemaActive]);

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
