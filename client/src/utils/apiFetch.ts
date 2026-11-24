import { BACKEND_URL } from '../config';
import { notifySessionExpired } from './authSession';
import { safeGetItem, safeRemoveItem } from './safeStorage';

export const AUTH_TOKEN_KEY = 'whiteboard_auth_token';
export const AUTH_USER_KEY = 'whiteboard_cached_user';

export interface ApiErrorData {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: ApiErrorData
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Drop credentials that the server has already rejected. */
export function clearStoredAuth(): void {
  safeRemoveItem(AUTH_TOKEN_KEY);
  safeRemoveItem(AUTH_USER_KEY);
}

/**
 * Single entry point for authenticated REST/AI calls. Injects the current
 * token and turns a 401 into one session-expiry notification, so every caller
 * recovers consistently instead of showing a generic error.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = safeGetItem(AUTH_TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearStoredAuth();
    notifySessionExpired();
  }
  return res;
}

/** apiFetch plus JSON parsing and the project's `success: false` convention. */
export async function apiFetchJson<T extends ApiErrorData = ApiErrorData>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(path, init);
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new ApiError('The server returned an unreadable response.', res.status);
  }
  if (!res.ok || data?.success === false) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data ?? undefined);
  }
  return data as T;
}
