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
  /** Estimated seconds remaining, computed from recent progress rate (last 30s). */
  etaSeconds?: number | null;
}

export interface JobsState {
  jobs: Job[];
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  upsertJob: (job: Job) => void;
  removeJob: (id: string) => void;
}

// Per-job progress history used to estimate ETA. Kept outside of the Zustand
// state so it doesn't pollute renders — it's pure runtime bookkeeping.
const jobHistory: Map<string, Array<{ t: number; p: number }>> = new Map();

/** Recompute the ETA (seconds remaining) for a job from its recent progress history. */
function computeEta(jobId: string, progress: number): number | null {
  const now = Date.now() / 1000;
  let history = jobHistory.get(jobId);
  if (!history) {
    history = [];
    jobHistory.set(jobId, history);
  }
  history.push({ t: now, p: progress });
  // Keep only the last 30 seconds of samples.
  const cutoff = now - 30;
  while (history.length > 0 && history[0].t < cutoff) history.shift();

  if (history.length < 2 || progress >= 100) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const dt = last.t - first.t;
  const dp = last.p - first.p;
  // Need at least ~1s of signal and forward progress to produce a number.
  if (dt < 1 || dp <= 0) return null;
  const ratePerSec = dp / dt;
  const remaining = Math.max(0, 100 - progress);
  return Math.round(remaining / ratePerSec);
}

/** Clear history for terminal states so stale data doesn't affect a re-run with the same id. */
function clearJobHistory(jobId: string) {
  jobHistory.delete(jobId);
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  addJob: (job) => set((state) => {
    const withEta: Job = { ...job };
    if (job.status === 'running' || job.status === 'pending') {
      withEta.etaSeconds = computeEta(job.id, job.progress ?? 0);
    } else {
      clearJobHistory(job.id);
      withEta.etaSeconds = null;
    }
    return { jobs: [...state.jobs, withEta] };
  }),
  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map((j) => {
      if (j.id !== id) return j;
      const next = { ...j, ...updates };
      if (next.status === 'running' || next.status === 'pending') {
        next.etaSeconds = computeEta(id, next.progress ?? 0);
      } else {
        clearJobHistory(id);
        next.etaSeconds = null;
      }
      return next;
    }),
  })),
  upsertJob: (job) => set((state) => {
    const index = state.jobs.findIndex((j) => j.id === job.id);
    const isRunning = job.status === 'running' || job.status === 'pending';
    const etaSeconds = isRunning
      ? computeEta(job.id, job.progress ?? 0)
      : (clearJobHistory(job.id), null);
    if (index >= 0) {
      const newJobs = [...state.jobs];
      newJobs[index] = { ...newJobs[index], ...job, etaSeconds };
      return { jobs: newJobs };
    }
    return { jobs: [...state.jobs, { ...job, etaSeconds }] };
  }),
  removeJob: (id) => set((state) => {
    clearJobHistory(id);
    return { jobs: state.jobs.filter((j) => j.id !== id) };
  }),
}));
