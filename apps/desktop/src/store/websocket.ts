import { create } from 'zustand';
import { ENGINE_API_URL, ENGINE_WS_URL } from '@/lib/config';
import { isValidWsMessage } from '@/lib/types';
import type { WsMessage } from '@/lib/types';
import { useJobsStore } from './jobs';
import type { Job } from './jobs';
import { useToastStore } from './toast';
import { useProjectsStore } from './projects';
import type { Project } from './projects';
import { api } from '@/lib/api';

// Track segments we've already kicked content-gen for, so a re-broadcast of the
// same completed export doesn't fire the request twice in a session.
const autoContentGenSeen = new Set<string>();

async function kickContentGenForExportedSegment(projectId: string, segmentId: string) {
  const key = `${projectId}:${segmentId}`;
  if (autoContentGenSeen.has(key)) return;
  autoContentGenSeen.add(key);
  try {
    const segRes = await api.getSegment(projectId, segmentId);
    const seg: any = (segRes as any)?.data ?? segRes;
    const transcript: string =
      (typeof seg?.transcript === 'string' && seg.transcript) ||
      seg?.transcript?.text ||
      '';
    const tags: string[] = seg?.score?.tags ?? seg?.tags ?? [];
    if (transcript) {
      await api.generateSegmentContent(transcript, tags, 'tiktok');
      // Result is cached on the backend via LLM cache — we don't need the response here.
    }
  } catch {
    // Fire-and-forget — failures are fine, user can trigger manually.
  }
}

// WebSocket store
interface WebSocketState {
  connected: boolean;
  lastMessage?: any;
  connect: () => void;
  disconnect: () => void;
}

// Exponential backoff constants for reconnect
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

export const useWebSocketStore = create<WebSocketState>((set, _get) => {
  let socket: WebSocket | null = null;
  let reconnectTimer: any = null;
  let pollingTimer: any = null;
  let lastWsMessageAt = 0;
  let stallCheckTimer: any = null;
  let reconnectAttempts = 0;

  // Poll backend for job updates (only used as fallback when WS is stale)
  const pollJobs = async () => {
    try {
      const response = await fetch(`${ENGINE_API_URL}/jobs`);
      if (response.ok) {
        const data = await response.json();
        const jobs = data.data || [];
        jobs.filter((j: any) => j.status === 'running').forEach((job: any) => {
          useJobsStore.getState().upsertJob(job);
        });
      }
    } catch {
      // Ignore polling errors
    }
  };

  const startPolling = () => {
    if (pollingTimer) return;
    pollingTimer = setInterval(pollJobs, 3000);
  };

  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  // Only start polling if WS has been silent for 10s (stall detection)
  const startStallCheck = () => {
    if (stallCheckTimer) return;
    stallCheckTimer = setInterval(() => {
      const stale = Date.now() - lastWsMessageAt > 10_000;
      const hasRunningJobs = useJobsStore.getState().jobs.some(j => j.status === 'running');
      if (stale && hasRunningJobs && !pollingTimer) {
        startPolling();
      } else if (!stale && pollingTimer) {
        stopPolling();
      }
    }, 5000);
  };

  const stopStallCheck = () => {
    if (stallCheckTimer) {
      clearInterval(stallCheckTimer);
      stallCheckTimer = null;
    }
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const raw: unknown = JSON.parse(event.data);
      if (!isValidWsMessage(raw)) return;
      const data: WsMessage = raw;
      lastWsMessageAt = Date.now();

      if (data.type === 'JOB_UPDATE') {
        const job = (data as import('@/lib/types').WsJobUpdate).payload;
        const prevJob = useJobsStore.getState().jobs.find((j) => j.id === job.id);

        // Update jobs store directly
        useJobsStore.getState().upsertJob(job as Job);

        // Check for job completion to trigger notifications
        // Now also trigger on pending -> completed (for fast jobs)
        const wasNotComplete = !prevJob || prevJob.status === 'running' || prevJob.status === 'pending';
        if (wasNotComplete && job.status === 'completed') {
          // When an export finishes, auto-kick content generation so titles,
          // hashtags and description are ready in the LLM cache before the user
          // asks. Fire-and-forget; backend caches the result.
          if (job.type === 'export') {
            const result = (job as any).result as Record<string, unknown> | undefined;
            const segmentId = (result?.segment_id ?? result?.segmentId) as string | undefined;
            const projectId = (job as any).projectId ?? (job as any).project_id;
            if (segmentId && projectId) {
              void kickContentGenForExportedSegment(projectId as string, segmentId);
            }
          }

          // Desktop notification — specialized body for analyze jobs
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              if (job.type === 'analyze') {
                const result = (job as any).result as Record<string, unknown> | undefined;
                const segmentsCount = (result?.segments_count ?? result?.segmentsCount ?? '?') as string | number;
                new Notification('FORGE LAB — Analyse terminée', {
                  body: `${segmentsCount} segments détectés. Prêt pour la forge.`,
                  icon: '/icon.png',
                  tag: `analyze-${job.projectId ?? job.id}`,
                });
              } else {
                new Notification('FORGE LAB', {
                  body: `${getJobTypeLabel(job.type)} terminé avec succès`,
                  icon: '/icon.png',
                });
              }
            } catch {
              // Notification API failed (e.g. permission revoked mid-session)
            }
          }
          // Toast notification
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Tâche terminée',
            message: `${getJobTypeLabel(job.type)} complété`,
          });
        } else if (wasNotComplete && job.status === 'failed') {
          // Desktop notification for failure
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('FORGE LAB', {
              body: `${getJobTypeLabel(job.type)} a échoué`,
              icon: '/icon.png',
            });
          }
          // Toast notification
          useToastStore.getState().addToast({
            type: 'error',
            title: 'Erreur',
            message: (job.error as string) || `${getJobTypeLabel(job.type)} a échoué`,
          });
        }
      } else if (data.type === 'PROJECT_UPDATE') {
        // Handle project status updates
        const project = (data as import('@/lib/types').WsProjectUpdate).payload;
        // Project status update received via WebSocket

        // Update projects store
        useProjectsStore.getState().updateProject(project as Partial<Project> & { id: string });

        // Show toast for status changes
        const statusMessages: Record<string, string> = {
          ingested: 'Ingestion terminée',
          analyzed: 'Analyse terminée',
          error: 'Erreur sur le projet',
        };

        if (statusMessages[project.status]) {
          useToastStore.getState().addToast({
            type: project.status === 'error' ? 'error' : 'info',
            title: statusMessages[project.status],
            message: (project as Record<string, unknown>).name as string || project.id.slice(0, 8),
          });
        }
      }
    } catch {
      // Malformed WebSocket message, ignore
    }
  };

  const getJobTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      ingest: 'Ingestion',
      analyze: 'Analyse',
      export: 'Export',
      render_proxy: 'Proxy',
      render_final: 'Rendu final',
    };
    return labels[type] || type;
  };

  const connect = () => {
    // Avoid multiple connections
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

    socket = new WebSocket(ENGINE_WS_URL);

    socket.onopen = () => {
      set({ connected: true });
      lastWsMessageAt = Date.now();
      reconnectAttempts = 0; // Reset backoff on successful connection
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling(); // Stop polling once WS is live
      startStallCheck(); // Monitor for WS stalls
    };

    socket.onclose = () => {
      set({ connected: false });
      socket = null;
      stopStallCheck();
      startPolling(); // Fall back to polling while disconnected

      // Exponential backoff: 3s → 6s → 12s → 24s → 48s → 60s (capped)
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      if (socket) socket.close();
    };

    socket.onmessage = handleMessage;
  };

  return {
    connected: false,
    connect,
    disconnect: () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectAttempts = 0; // Reset backoff on intentional disconnect
      stopPolling();
      stopStallCheck();
      if (socket) socket.close();
      socket = null;
      set({ connected: false });
    }
  };
});
