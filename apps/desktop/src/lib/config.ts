/**
 * Application configuration constants.
 * Centralized to avoid hardcoded values scattered across components.
 */

const DEFAULT_ENGINE_PORT = 8420;
const DEFAULT_ENGINE_HOST = 'localhost';

export const ENGINE_BASE_URL = `http://${DEFAULT_ENGINE_HOST}:${DEFAULT_ENGINE_PORT}`;
export const ENGINE_API_URL = `${ENGINE_BASE_URL}/v1`;
export const ENGINE_WS_URL = `ws://${DEFAULT_ENGINE_HOST}:${DEFAULT_ENGINE_PORT}/v1/ws`;

/** Build a URL for serving project media (proxy, audio, etc.) */
export function mediaUrl(projectId: string, fileType: string): string {
  return `${ENGINE_BASE_URL}/media/${projectId}/${fileType}`;
}

/** Build a URL for project thumbnails */
export function thumbnailUrl(projectId: string, time?: number): string {
  const base = `${ENGINE_API_URL}/projects/${projectId}/thumbnail`;
  return time != null ? `${base}?time=${time}` : base;
}
