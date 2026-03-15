/**
 * API client for the Sentinel backend server.
 * All endpoints use POST with JSON body.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000') + '/api';


/**
 * In-memory token for the current session.
 * We do NOT write to localStorage — the httpOnly cookie set by the backend
 * is automatically sent by fetch() via `credentials: 'include'`.
 * This in-memory token is kept as a fallback for explicit Authorization header
 * use (e.g. mobile / API token flows).
 */
const TOKEN_KEY = 'sentinel_token';
let _sessionToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null) {
  _sessionToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getToken() {
  return _sessionToken;
}

async function request<T>(
  path: string,
  body?: Record<string, unknown>,
  options?: { method?: string; signal?: AbortSignal },
): Promise<T> {
  const method = options?.method ?? 'POST';
  const url = `${BASE_URL}${path}`;
  const token = getToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    signal: options?.signal,
  });

  if (!res.ok) {
    let errBody: unknown = null;
    try { errBody = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, res.statusText, errBody);
  }

  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** POST JSON to API */
export function post<T = unknown>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return request<T>(path, body, { method: 'POST', signal });
}

/** GET from API */
export function get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, undefined, { method: 'GET', signal });
}
