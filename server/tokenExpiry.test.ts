import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectiveExpiry, isTokenExpired, TOKEN_TTL_MS } from './tokenExpiry';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function activeToken() {
  return {
    createdAt: NOW - 40 * DAY,
    updatedAt: NOW - 2 * DAY,
    expiresAt: new Date(NOW + 28 * DAY),
  };
}

test('active sliding session with an old createdAt is still valid', () => {
  assert.equal(isTokenExpired(activeToken(), NOW), false);
});

test('session expires when stored expiry has passed', () => {
  assert.equal(isTokenExpired({ ...activeToken(), expiresAt: new Date(NOW - DAY) }, NOW), true);
});

test('session expires when last activity is older than the TTL', () => {
  assert.equal(isTokenExpired({ ...activeToken(), updatedAt: NOW - 31 * DAY }, NOW), true);
});

test('a far-future TTL anchor cannot extend an idle session', () => {
  const token = { ...activeToken(), updatedAt: NOW - 40 * DAY, expiresAt: new Date(NOW + 365 * DAY) };
  assert.equal(isTokenExpired(token, NOW), true);
});

test('legacy token without expiresAt falls back to last activity plus TTL', () => {
  const token = { createdAt: NOW - 10 * DAY, updatedAt: NOW - 10 * DAY };
  assert.equal(getEffectiveExpiry(token), NOW - 10 * DAY + TOKEN_TTL_MS);
  assert.equal(isTokenExpired(token, NOW), false);
});

test('missing or invalid activity timestamps are treated as expired', () => {
  assert.equal(isTokenExpired({}, NOW), true);
  assert.equal(isTokenExpired({ createdAt: NaN, expiresAt: new Date('nope') }, NOW), true);
});
