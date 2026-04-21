import { useEffect, useState, useRef } from 'react';
import { ENGINE_BASE_URL } from '@/lib/config';

/**
 * Stream job logs via Server-Sent Events.
 * Near-zero latency, persistent connection, auto-reconnect on error.
 * Returns the accumulated lines (capped at 500).
 */
export function useJobLogStream(jobId: string | undefined, enabled = true) {
  const [lines, setLines] = useState<string[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) {
      setLines([]);
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      return;
    }

    setLines([]);
    const source = new EventSource(`${ENGINE_BASE_URL}/v1/jobs/${jobId}/stream-logs`);
    sourceRef.current = source;

    source.onmessage = (e) => {
      if (!e.data) return;
      setLines((prev) => {
        const next = [...prev, e.data];
        // Cap memory: keep last 500
        return next.length > 500 ? next.slice(-500) : next;
      });
    };

    source.onerror = () => {
      // EventSource auto-reconnects; just log
      console.debug('[useJobLogStream] connection error, auto-retry');
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [jobId, enabled]);

  return lines;
}
