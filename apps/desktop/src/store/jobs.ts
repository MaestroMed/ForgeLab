import { create } from 'zustand';

// Active jobs store
export interface Job {
  id: string;
  type: string;
  projectId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage?: string;
  message?: string;
  error?: string;
  outputPath?: string;
}

export interface JobsState {
  jobs: Job[];
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  upsertJob: (job: Job) => void;
  removeJob: (id: string) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
  })),
  upsertJob: (job) => set((state) => {
    const index = state.jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) {
      const newJobs = [...state.jobs];
      newJobs[index] = { ...newJobs[index], ...job };
      return { jobs: newJobs };
    }
    return { jobs: [...state.jobs, job] };
  }),
  removeJob: (id) => set((state) => ({
    jobs: state.jobs.filter((j) => j.id !== id),
  })),
}));
