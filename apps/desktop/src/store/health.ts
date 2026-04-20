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

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useHealthStore = create<HealthState>((set, get) => ({
  backendOnline: false,
  health: null,
  loading: false,
  error: null,
  lastCheck: 0,

  check: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${ENGINE_BASE_URL}/v1/capabilities/health`, {
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
      get().check();
    }, 30000);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));
