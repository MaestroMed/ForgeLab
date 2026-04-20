import { create } from 'zustand';
import { ENGINE_BASE_URL } from '@/lib/config';

export interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  [key: string]: any;
}

export interface HealthStatus {
  overall_status: 'ok' | 'warning' | 'error';
  checks: Record<string, HealthCheck>;
  timestamp: number;
}

interface HealthState {
  backendOnline: boolean;
  health: HealthStatus | null;
  loading: boolean;
  error: string | null;
  lastCheck: number;
  check: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

const POLL_INTERVAL_MS = 30_000;
// Skip an identical fetch if one fired within this window — prevents a
// redundant check when the overlay remounts right after the badge already
// triggered polling.
const MIN_REFRESH_MS = 5_000;

let pollInterval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

export const useHealthStore = create<HealthState>((set, get) => ({
  backendOnline: false,
  health: null,
  loading: false,
  error: null,
  lastCheck: 0,

  check: async () => {
    const { lastCheck, loading } = get();
    if (loading) return;
    if (lastCheck && Date.now() - lastCheck < MIN_REFRESH_MS) return;
    set({ loading: true });
    try {
      const res = await fetch(`${ENGINE_BASE_URL}/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as HealthStatus;
      set({
        health: data,
        backendOnline: true,
        loading: false,
        error: null,
        lastCheck: Date.now(),
      });
    } catch (e: any) {
      set({
        backendOnline: false,
        loading: false,
        error: e?.message ?? 'Backend unreachable',
        lastCheck: Date.now(),
      });
    }
  },

  startPolling: () => {
    if (pollInterval) return;
    get().check();
    pollInterval = setInterval(() => {
      // Skip when the tab is hidden — there's no UI to update and we don't
      // want to burn requests in the background.
      if (typeof document !== 'undefined' && document.hidden) return;
      get().check();
    }, POLL_INTERVAL_MS);

    // Fire an immediate check when the tab regains focus so the user sees a
    // fresh status instead of whatever we had before hiding.
    if (typeof document !== 'undefined' && !visibilityHandler) {
      visibilityHandler = () => {
        if (!document.hidden) get().check();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (typeof document !== 'undefined' && visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  },
}));
