import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal } from 'lucide-react';
import { ENGINE_BASE_URL } from '@/lib/config';

interface Props {
  jobId: string;
  onClose: () => void;
}

interface LogsResponse {
  success?: boolean;
  data?: {
    job_id: string;
    lines: string[];
    count: number;
    total: number;
  };
  // Fallback shape (in case the backend response is flat).
  lines?: string[];
}

export default function JobLogDrawer({ jobId, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll backend every 2s while the drawer is open.
  useEffect(() => {
    let active = true;
    const fetchLogs = async () => {
      try {
        const res = await fetch(
          `${ENGINE_BASE_URL}/v1/jobs/${jobId}/logs?lines=500`,
        );
        if (!res.ok) return;
        const payload: LogsResponse = await res.json();
        const next = payload?.data?.lines ?? payload?.lines ?? [];
        if (active) setLines(next);
      } catch {
        // silently swallow — backend may be starting up
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId]);

  // Auto-scroll to the bottom when new lines arrive (unless the user scrolled up).
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 w-[500px] bg-black/95 border-l border-white/10 z-40 flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">
              Logs {jobId.slice(0, 8)}
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {lines.length} lignes
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/5 rounded"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom =
              el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
            setAutoScroll(atBottom);
          }}
          className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5"
        >
          {lines.length === 0 ? (
            <p className="text-[var(--text-muted)]">
              Aucun log disponible pour ce job.
            </p>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes('ERROR')
                    ? 'text-red-400'
                    : line.includes('WARNING')
                    ? 'text-yellow-400'
                    : 'text-white/70'
                }
              >
                {line}
              </div>
            ))
          )}
        </div>

        <div className="p-2 border-t border-white/10 text-[10px] text-[var(--text-muted)] text-center">
          {autoScroll
            ? 'Auto-scroll actif'
            : 'Scroll manuel · scrollez tout en bas pour réactiver'}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
