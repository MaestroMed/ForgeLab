/** API client for FORGE Engine backend */

const API_BASE = '/v1/clips';
const VIRALITY_BASE = '/v1/virality';

export interface QueuedClip {
  id: string;
  projectId: string;
  segmentId: string;
  title: string | null;
  description: string | null;
  hashtags: string[];
  videoPath: string;
  coverPath: string | null;
  duration: number;
  viralScore: number;
  status: string;
  targetPlatform: string | null;
  channelName: string | null;
  createdAt: string;
}

async function checkOk(res: Response): Promise<Response> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res;
}

export async function fetchPendingClips(channel?: string): Promise<QueuedClip[]> {
  const url = channel
    ? `${API_BASE}/queue/pending?channel=${channel}`
    : `${API_BASE}/queue/pending`;
  const res = await fetch(url).then(checkOk);
  const data = await res.json();
  return data.data || [];
}

export async function approveClip(
  clipId: string,
  opts?: { title?: string; description?: string; hashtags?: string[] }
): Promise<QueuedClip> {
  const res = await fetch(`${API_BASE}/queue/${clipId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {}),
  }).then(checkOk);
  const data = await res.json();
  return data.data;
}

export async function rejectClip(clipId: string): Promise<QueuedClip> {
  const res = await fetch(`${API_BASE}/queue/${clipId}/reject`, {
    method: 'POST',
  }).then(checkOk);
  const data = await res.json();
  return data.data;
}

export async function submitReview(params: {
  segmentId: string;
  projectId: string;
  rating: number;
  qualityTags?: string[];
  issueTags?: string[];
  publishDecision?: string;
}) {
  const res = await fetch(`${API_BASE}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      segment_id: params.segmentId,
      project_id: params.projectId,
      rating: params.rating,
      quality_tags: params.qualityTags,
      issue_tags: params.issueTags,
      publish_decision: params.publishDecision,
    }),
  }).then(checkOk);
  return res.json();
}

export function getClipVideoUrl(clipId: string): string {
  return `/clips/${clipId}/video`;
}

export async function getSimilarStats(
  predictedScore: number,
  platform = 'tiktok',
): Promise<{ avg_views: number; count: number } | null> {
  try {
    const res = await fetch(
      `${VIRALITY_BASE}/similar-stats?predicted_score=${predictedScore}&platform=${platform}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
