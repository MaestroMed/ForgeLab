import { useQuery } from '@tanstack/react-query';
import { ENGINE_BASE_URL } from '@/lib/config';

interface LogsResponse {
  success?: boolean;
  data?: {
    job_id: string;
    lines: string[];
    count: number;
    total: number;
  };
  lines?: string[];
}

/**
 * Shared job logs polling hook.
 *
 * Every component that wants to tail the same job's logs shares a single
 * polling stream (React Query dedups per `queryKey`). Pauses when the tab
 * is hidden or the hook is disabled.
 */
export function useJobLogs(
  jobId: string | undefined,
  lines = 500,
  enabled = true,
) {
  return useQuery<string[]>({
    queryKey: ['job-logs', jobId, lines],
    queryFn: async () => {
      if (!jobId) return [];
      try {
        const res = await fetch(
          `${ENGINE_BASE_URL}/v1/jobs/${jobId}/logs?lines=${lines}`,
        );
        if (!res.ok) return [];
        const data = (await res.json()) as LogsResponse;
        return data?.data?.lines ?? data?.lines ?? [];
      } catch {
        // Backend may be starting up or the job may have been deleted —
        // surface an empty array rather than a hard failure.
        return [];
      }
    },
    refetchInterval: 1500,
    refetchIntervalInBackground: false,
    staleTime: 1000,
    enabled: enabled && !!jobId,
  });
}
