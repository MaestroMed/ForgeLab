import { useQuery } from '@tanstack/react-query';
import { ENGINE_BASE_URL } from '@/lib/config';

export interface GpuStats {
  utilization_pct: number;
  vram_used_mb: number;
  vram_total_mb: number;
  power_w: number;
  power_max_w: number;
  temp_c: number;
}

/**
 * Shared GPU stats polling hook.
 *
 * React Query deduplicates requests across every subscriber, so regardless of
 * how many components mount the FurnaceHUD (or anything else that needs GPU
 * telemetry), there is at most one `/v1/gpu/stats` request in flight every
 * ~2 seconds. When the tab is hidden the interval pauses automatically.
 */
export function useGpuStats(enabled = true) {
  return useQuery<GpuStats>({
    queryKey: ['gpu-stats'],
    queryFn: async () => {
      const res = await fetch(`${ENGINE_BASE_URL}/v1/gpu/stats`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as GpuStats;
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: false, // Stop when tab hidden
    staleTime: 1500, // Don't refetch if < 1.5s old
    gcTime: 10_000,
    retry: 1,
    enabled,
  });
}
