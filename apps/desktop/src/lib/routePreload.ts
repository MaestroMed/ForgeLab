import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { QUERY_KEYS } from './queries';

/**
 * Prefetch the ProjectPage's critical data on hover so navigating feels
 * instant. Fires three queries in parallel with a 30-second staleTime so the
 * in-flight cache entries are still fresh when the user actually clicks the
 * card. Errors are swallowed: this is background work, a failed prefetch
 * just means the normal request happens after navigation.
 *
 * Call pattern: invoke from an `onMouseEnter` / `onFocus` handler on a
 * clickable card. React Query dedupes repeated calls, so debouncing here is
 * unnecessary.
 */
export function preloadProject(queryClient: QueryClient, projectId: string) {
  if (!projectId) return;
  // Fire in parallel, ignore errors (background prefetch).
  queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.project(projectId),
    queryFn: () => api.getProject(projectId),
    staleTime: 30_000,
  });
  queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.segments(projectId, { sortBy: 'score', pageSize: 100 }),
    queryFn: () =>
      api.listSegments(projectId, { sortBy: 'score', pageSize: 100 }),
    staleTime: 30_000,
  });
  queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.artifacts(projectId),
    queryFn: () => api.listArtifacts(projectId),
    staleTime: 30_000,
  });
}

/** Preload the analytics summary when hovering the Analytics nav item. */
export function preloadAnalytics(queryClient: QueryClient, platform = 'tiktok') {
  queryClient.prefetchQuery({
    queryKey: ['analytics-summary', platform],
    queryFn: () => api.getAnalyticsSummary(platform, 10),
    staleTime: 60_000,
  });
}

/** Preload the clip-history page's cross-project artifact list. */
export function preloadClipHistory(queryClient: QueryClient) {
  queryClient.prefetchQuery({
    queryKey: ['all-artifacts'],
    queryFn: async () => {
      const projects = await api.listProjects(1, 100);
      const items = projects?.data?.items || [];
      return items;
    },
    staleTime: 30_000,
  });
}
