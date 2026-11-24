import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOAuthState,
  verifyOAuthState,
  readCookie,
  oauthCookieOptions,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_TTL_MS,
} from './oauthState';

const NOW = 1_700_000_000_000;
const NONCE = 'a-random-nonce-value';

function state(overrides: Record<string, unknown> = {}): string {
  return createOAuthState({
    redirectUri: 'https://api.example.com/auth/google/callback',
    origin: 'https://app.example.com',
    nonce: NONCE,
    issuedAt: NOW,
    ...overrides,
  });
}

function cookie(value: string = NONCE): string {
  return `other=1; ${OAUTH_NONCE_COOKIE}=${value}; theme=dark`;
}

test('accepts a state whose nonce matches the browser cookie', () => {
  const result = verifyOAuthState(state(), cookie(), NOW);
  assert.equal(result?.nonce, NONCE);
  assert.equal(result?.origin, 'https://app.example.com');
});

test('rejects a state with no matching cookie', () => {
  assert.equal(verifyOAuthState(state(), undefined, NOW), null);
  assert.equal(verifyOAuthState(state(), 'other=1', NOW), null);
});

test('rejects a replayed state from a different browser', () => {
  assert.equal(verifyOAuthState(state(), cookie('attacker-nonce'), NOW), null);
});

test('rejects tampered, malformed and missing state', () => {
  assert.equal(verifyOAuthState('not-base64-json', cookie(), NOW), null);
  assert.equal(verifyOAuthState(null, cookie(), NOW), null);
  assert.equal(verifyOAuthState(state({ nonce: undefined }), cookie(), NOW), null);
});

test('rejects expired state and future-dated state', () => {
  assert.equal(verifyOAuthState(state(), cookie(), NOW + 11 * 60 * 1000), null);
  assert.equal(verifyOAuthState(state(), cookie(), NOW - 5 * 60 * 1000), null);
});

test('reads only the requested cookie', () => {
  assert.equal(readCookie(cookie(), OAUTH_NONCE_COOKIE), NONCE);
  assert.equal(readCookie(`theme=dark`, OAUTH_NONCE_COOKIE), null);
});

test('keeps a Lax cookie when frontend and backend share a host', () => {
  const options = oauthCookieOptions({
    frontendOrigin: 'https://app.example.com',
    serverOrigin: 'https://app.example.com',
    secure: true,
  });
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.maxAge, OAUTH_STATE_TTL_MS);
  assert.equal(options.path, '/');
});

test('uses a Secure SameSite=None cookie for split frontend/backend hosts', () => {
  const options = oauthCookieOptions({
    frontendOrigin: 'https://whiteboard-io-1.onrender.com',
    serverOrigin: 'https://whiteboard-io-server.onrender.com',
  });
  assert.equal(options.sameSite, 'none');
  assert.equal(options.secure, true);
});

test('keeps a Lax cookie for cross-origin local HTTP development', () => {
  const options = oauthCookieOptions({
    frontendOrigin: 'http://127.0.0.1:5173',
    serverOrigin: 'http://localhost:3000',
  });
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.secure, false);
});

test('falls back to Lax for missing or malformed origins', () => {
  assert.equal(oauthCookieOptions({}).sameSite, 'lax');
  assert.equal(oauthCookieOptions({ frontendOrigin: 'not a url' }).sameSite, 'lax');
});
