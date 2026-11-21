import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOAuthState,
  verifyOAuthState,
  readCookie,
  OAUTH_NONCE_COOKIE,
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
