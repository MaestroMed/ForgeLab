// Lightweight runtime validators for WebSocket payloads coming from the
// FORGE engine. Keeps the store defensive against stale clients, malformed
// messages, or a compromised local process pretending to be the engine.
//
// We intentionally avoid pulling in zod here — the desktop app has no runtime
// schema dep yet, and these shapes are small and stable. When @forge-lab/shared
// is wired (see P2.7), replace these with z.infer-typed parsers.

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WsJobPayload {
  id: string;
  type: string;
  project_id?: string | null;
  status: JobStatus;
  progress: number;
  stage?: string | null;
  message?: string | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WsProjectPayload {
  id: string;
  status: string;
  name?: string;
  [key: string]: unknown;
}

export type WsEnvelope =
  | { type: 'JOB_UPDATE'; payload: WsJobPayload }
  | { type: 'PROJECT_UPDATE'; payload: WsProjectPayload };

const JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'pending', 'running', 'completed', 'failed', 'cancelled',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJobPayload(raw: unknown): WsJobPayload | null {
  if (!isPlainObject(raw)) return null;
  const { id, type, status, progress } = raw;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof type !== 'string' || type.length === 0) return null;
  if (typeof status !== 'string' || !JOB_STATUSES.has(status as JobStatus)) return null;
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
  // Everything else is optional. We cast through unknown to keep the contract
  // narrow without rejecting engine-added fields.
  return raw as unknown as WsJobPayload;
}

function parseProjectPayload(raw: unknown): WsProjectPayload | null {
  if (!isPlainObject(raw)) return null;
  const { id, status } = raw;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof status !== 'string') return null;
  return raw as unknown as WsProjectPayload;
}

/** Parse a raw WebSocket message string into a typed envelope, or null if invalid. */
export function parseWsMessage(raw: string): WsEnvelope | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(data)) return null;
  const { type, payload } = data;
  if (type === 'JOB_UPDATE') {
    const job = parseJobPayload(payload);
    return job ? { type, payload: job } : null;
  }
  if (type === 'PROJECT_UPDATE') {
    const project = parseProjectPayload(payload);
    return project ? { type, payload: project } : null;
  }
  return null;
}
