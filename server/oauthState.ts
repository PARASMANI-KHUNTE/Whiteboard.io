import crypto from 'crypto';

export const OAUTH_NONCE_COOKIE = 'wb_oauth_nonce';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export interface OAuthCookieOptions {
  httpOnly: boolean;
  sameSite: "lax" | "none";
  secure: boolean;
  maxAge: number;
  path: string;
}

/**
 * Older clients request the auth URL with a cross-site fetch, which cannot set
 * a Lax cookie. Use SameSite=None; Secure only for cross-host HTTPS deployments,
 * where browsers require those attributes; every other setup keeps Lax.
 */
export function oauthCookieOptions({
  frontendOrigin,
  serverOrigin,
  secure = false,
}: {
  frontendOrigin?: string;
  serverOrigin?: string;
  secure?: boolean;
}): OAuthCookieOptions {
  let crossSiteHttps = false;
  if (frontendOrigin && serverOrigin) {
    try {
      const frontend = new URL(frontendOrigin);
      const server = new URL(serverOrigin);
      crossSiteHttps =
        frontend.hostname !== server.hostname &&
        frontend.protocol === "https:" &&
        server.protocol === "https:";
    } catch {
      crossSiteHttps = false;
    }
  }
  return {
    httpOnly: true,
    sameSite: crossSiteHttps ? "none" : "lax",
    secure: crossSiteHttps || secure,
    maxAge: OAUTH_STATE_TTL_MS,
    path: "/",
  };
}

export interface OAuthStatePayload {
  redirectUri?: string;
  origin?: string;
  nonce?: string;
  issuedAt?: number;
}

export function createOAuthState(params: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(params)).toString('base64url');
}

export function parseOAuthState(state: unknown): OAuthStatePayload | null {
  if (typeof state !== 'string' || !state) return null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    if (!decoded || typeof decoded !== 'object') return null;
    return decoded as OAuthStatePayload;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * A state value is only valid when its nonce matches the HttpOnly cookie set
 * when this browser started the flow and when it has not expired. This blocks
 * login-CSRF: an attacker cannot make a victim's browser complete OAuth with
 * the attacker's account.
 */
export function verifyOAuthState(
  state: unknown,
  cookieHeader: string | undefined,
  now: number = Date.now()
): OAuthStatePayload | null {
  const payload = parseOAuthState(state);
  if (!payload || typeof payload.nonce !== 'string' || !payload.nonce) return null;

  const cookieNonce = readCookie(cookieHeader, OAUTH_NONCE_COOKIE);
  if (!cookieNonce || !constantTimeEqual(cookieNonce, payload.nonce)) return null;

  const issuedAt = Number(payload.issuedAt) || 0;
  if (!issuedAt || now - issuedAt > OAUTH_STATE_TTL_MS || issuedAt - now > MAX_CLOCK_SKEW_MS) {
    return null;
  }
  return payload;
}
