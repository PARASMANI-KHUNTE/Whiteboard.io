import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAllowedOriginSet, resolveTrustedOriginFromSet } from './corsOrigins';

test('does not include hardcoded localhost origins when env vars are empty (#237)', () => {
  const allowed = buildAllowedOriginSet({});
  assert.equal(allowed.size, 0);
  assert.equal(allowed.has('http://localhost:3000'), false);
  assert.equal(allowed.has('http://localhost:5173'), false);
  assert.equal(allowed.has('http://127.0.0.1:3000'), false);
  assert.equal(allowed.has('http://127.0.0.1:5173'), false);
});

test('reads allowed origins from APP_URL, CLIENT_URL, and comma-separated ALLOWED_ORIGINS', () => {
  const allowed = buildAllowedOriginSet({
    APP_URL: 'https://app.whiteboard.example/room/123',
    CLIENT_URL: 'https://preview.whiteboard.example',
    ALLOWED_ORIGINS: ' https://admin.whiteboard.example , invalid-url , http://localhost:5173 ',
  });

  assert.equal(allowed.has('https://app.whiteboard.example'), true);
  assert.equal(allowed.has('https://preview.whiteboard.example'), true);
  assert.equal(allowed.has('https://admin.whiteboard.example'), true);
  assert.equal(allowed.has('http://localhost:5173'), true);
  assert.equal(allowed.size, 4);
});

test('resolveTrustedOriginFromSet permits allowlisted origins and rejects untrusted ones', () => {
  const allowed = buildAllowedOriginSet({
    APP_URL: 'https://app.whiteboard.example',
    ALLOWED_ORIGINS: 'https://studio.whiteboard.example',
  });

  assert.equal(
    resolveTrustedOriginFromSet(allowed, 'https://studio.whiteboard.example/callback', 'https://app.whiteboard.example'),
    'https://studio.whiteboard.example'
  );
  assert.equal(
    resolveTrustedOriginFromSet(allowed, 'http://localhost:5173', 'https://app.whiteboard.example'),
    'https://app.whiteboard.example'
  );
  assert.equal(
    resolveTrustedOriginFromSet(allowed, undefined, 'https://app.whiteboard.example'),
    'https://app.whiteboard.example'
  );
});
