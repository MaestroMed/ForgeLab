/**
 * Strict TypeScript types for the Forge Engine API.
 *
 * These interfaces mirror the camelCase shapes returned by the Python
 * model `to_dict()` methods in apps/forge-engine/src/forge_engine/models/.
 */

// ---------------------------------------------------------------------------
// Generic API wrapper (matches the shape already used in api.ts)
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Project  (from models/project.py  Project.to_dict)
// ---------------------------------------------------------------------------

export interface ApiProject {
  id: string;
  name: string;
  status: string;
  sourcePath: string;
  sourceFilename: string;
  duration?: number;
  resolution?: { width: number; height: number };
  fps?: number;
  audioTracks: number;
  proxyPath?: string;
  audioPath?: string;
  thumbnailPath?: string;
  errorMessage?: string;
  profileId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Enriched by list endpoint -- not present on single-get. */
  segmentsCount?: number;
  averageScore?: number;
}

// ---------------------------------------------------------------------------
// Segment  (from models/segment.py  Segment.to_dict)
// ---------------------------------------------------------------------------

export interface ApiSegmentScore {
  total: number;
  hookStrength: number;
  payoff: number;
  humourReaction: number;
  tensionSurprise: number;
  clarityAutonomy: number;
  rhythm: number;
  reasons: string[];
  tags: string[];
}

export interface ApiTranscriptWord {
  start: number;
  end: number;
  text: string;
}

export interface ApiSegment {
  id: string;
  projectId: string;
  startTime: number;
  endTime: number;
  duration: number;
  topicLabel?: string;
  hookText?: string;
  transcript?: string;
  transcriptSegments?: ApiTranscriptWord[];
  score: ApiSegmentScore;
  coldOpenRecommended: boolean;
  coldOpenStartTime?: number;
  layoutType?: string;
  facecamRect?: Record<string, number>;
  contentRect?: Record<string, number>;
  variants?: unknown[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Job  (from models/job.py  JobRecord.to_dict)
// ---------------------------------------------------------------------------

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ApiJob {
  id: string;
  projectId?: string;
  type: string;
  status: JobStatus;
  progress: number;
  stage?: string;
  message?: string;
  error?: string;
  result?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Paginated list wrapper (used by listSegments / listProjects)
// ---------------------------------------------------------------------------

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------

export interface WsJobUpdate {
  type: 'JOB_UPDATE';
  payload: {
    id: string;
    type: string;
    status: string;
    progress: number;
    [key: string]: unknown;
  };
}

export interface WsProjectUpdate {
  type: 'PROJECT_UPDATE';
  payload: {
    id: string;
    status: string;
    [key: string]: unknown;
  };
}

export type WsMessage =
  | WsJobUpdate
  | WsProjectUpdate
  | { type: string; payload?: unknown };

/**
 * Runtime type guard for incoming WebSocket messages.
 * Returns true when `data` is a non-null object with a string `type` field.
 */
export function isValidWsMessage(data: unknown): data is WsMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as Record<string, unknown>).type === 'string'
  );
}
