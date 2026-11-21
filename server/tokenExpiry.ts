export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface TokenExpiryFields {
  createdAt?: number;
  updatedAt?: number;
  expiresAt?: Date | string | number | null;
}

/**
 * Sliding sessions expire relative to the last recorded activity. `expiresAt`
 * is the Mongo TTL anchor and is bumped on every use; cap it by last activity
 * plus the TTL so a stale or corrupted anchor can never extend a session
 * indefinitely.
 */
export function getEffectiveExpiry(
  token: TokenExpiryFields,
  ttlMs: number = TOKEN_TTL_MS
): number | null {
  const lastActivity = Number(token.updatedAt) || Number(token.createdAt) || 0;
  if (!lastActivity) return null;

  const slidingExpiry = lastActivity + ttlMs;
  if (!token.expiresAt) return slidingExpiry;

  const storedExpiry = new Date(token.expiresAt).getTime();
  return Number.isFinite(storedExpiry) ? Math.min(storedExpiry, slidingExpiry) : slidingExpiry;
}

export function isTokenExpired(
  token: TokenExpiryFields,
  now: number = Date.now(),
  ttlMs: number = TOKEN_TTL_MS
): boolean {
  const expiry = getEffectiveExpiry(token, ttlMs);
  return expiry === null || now >= expiry;
}
