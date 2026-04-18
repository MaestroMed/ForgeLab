import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// Query keys constants
export const QUERY_KEYS = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  segments: (projectId: string, filters?: object) => ['segments', projectId, filters] as const,
  segmentStats: (projectId: string) => ['segment-stats', projectId] as const,
  segmentTags: (projectId: string) => ['segment-tags', projectId] as const,
  segmentSuggestions: (projectId: string) => ['segment-suggestions', projectId] as const,
  artifacts: (projectId: string) => ['artifacts', projectId] as const,
  jobs: (projectId?: string) => ['jobs', projectId] as const,
};

// Projects
export function useProjects(search?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.projects, search],
    queryFn: () => api.listProjects(1, 50, search || undefined),
    staleTime: 15_000,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.project(id) : [],
    queryFn: () => api.getProject(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

// Segments with filters
export function useSegments(
  projectId: string,
  filters: {
    minScore?: number;
    minDuration?: number;
    maxDuration?: number;
    search?: string;
    sortBy?: string;
    selectedTags?: string[];
    page?: number;
    pageSize?: number;
  }
) {
  return useQuery({
    queryKey: QUERY_KEYS.segments(projectId, filters),
    queryFn: () =>
      api.listSegments(projectId, {
        minScore: filters.minScore,
        minDuration: filters.minDuration,
        maxDuration: filters.maxDuration,
        search: filters.search,
        sortBy: filters.sortBy as 'score' | 'startTime' | 'duration' | undefined,
        tags: filters.selectedTags && filters.selectedTags.length > 0
          ? filters.selectedTags
          : undefined,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
      }),
    enabled: !!projectId,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });
}

export function useSegmentStats(projectId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.segmentStats(projectId),
    queryFn: () => api.getSegmentStats(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useSegmentTags(projectId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.segmentTags(projectId),
    queryFn: () => api.getSegmentTags(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useSegmentSuggestions(projectId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.segmentSuggestions(projectId),
    queryFn: () => api.getSegmentSuggestions(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useArtifacts(projectId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.artifacts(projectId),
    queryFn: () => api.listArtifacts(projectId),
    enabled: !!projectId,
    staleTime: 5_000,
  });
}
