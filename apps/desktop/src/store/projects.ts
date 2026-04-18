import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Projects store - synced via WebSocket
export interface Project {
  id: string;
  name: string;
  status: string;
  sourcePath?: string;
  proxyPath?: string;
  width?: number;
  height?: number;
  duration?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectsState {
  projects: Project[];
  lastUpdate: number;
  setProjects: (projects: Project[]) => void;
  updateProject: (project: Partial<Project> & { id: string }) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  lastUpdate: 0,
  setProjects: (projects) => set({ projects, lastUpdate: Date.now() }),
  updateProject: (project) => set((state) => {
    const index = state.projects.findIndex((p) => p.id === project.id);
    if (index >= 0) {
      const newProjects = [...state.projects];
      newProjects[index] = { ...newProjects[index], ...project };
      return { projects: newProjects, lastUpdate: Date.now() };
    }
    // Project not in list yet, add it
    return { projects: [...state.projects, project as Project], lastUpdate: Date.now() };
  }),
  addProject: (project) => set((state) => ({
    projects: [...state.projects, project],
    lastUpdate: Date.now(),
  })),
  removeProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id),
    lastUpdate: Date.now(),
  })),
}));

// Segment Filter store - persists filter preferences
interface SegmentFilterState {
  minScore: number;
  minDuration: number;
  maxDuration: number;
  limit: number | null;
  sortBy: 'score' | 'duration' | 'time';
  viewMode: 'grid' | 'list';
  search: string;
  selectedTags: string[];

  setFilters: (updates: Partial<SegmentFilterState>) => void;
  setSearch: (search: string) => void;
  setSelectedTags: (tags: string[]) => void;
  resetFilters: () => void;
}

const DEFAULT_SEGMENT_FILTERS = {
  minScore: 0,
  minDuration: 0,
  maxDuration: 600,
  limit: null as number | null,
  sortBy: 'score' as const,
  viewMode: 'grid' as const,
  search: '',
  selectedTags: [] as string[],
};

export const useSegmentFilterStore = create<SegmentFilterState>()(
  persist(
    (set) => ({
      ...DEFAULT_SEGMENT_FILTERS,

      setFilters: (updates) => set((state) => ({ ...state, ...updates })),

      setSearch: (search) => set({ search }),

      setSelectedTags: (selectedTags) => set({ selectedTags }),

      resetFilters: () => set(DEFAULT_SEGMENT_FILTERS),
    }),
    { name: 'forge-segment-filters' }
  )
);
