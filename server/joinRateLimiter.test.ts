import assert from 'node:assert/strict';
import test from 'node:test';
import { SlidingWindowRateLimiter } from './joinRateLimiter';

test('join limiter blocks attempts over the per-socket limit with a retry hint (#74)', () => {
  let now = 1_000;
  const limiter = new SlidingWindowRateLimiter(2, 100, 100, () => now);

  assert.deepEqual(limiter.check('socket-a'), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(limiter.check('socket-a'), { allowed: true, retryAfterMs: 0 });

  const blocked = limiter.check('socket-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 100);
});

test('join limiter uses a sliding window so traffic recovers without a hard reset (#74)', () => {
  let now = 0;
  const limiter = new SlidingWindowRateLimiter(2, 100, 100, () => now);

  limiter.check('socket-a');
  now = 40;
  limiter.check('socket-a');
  now = 60;
  const blocked = limiter.check('socket-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 40, 'oldest attempt in the window determines the wait');

  now = 101; // first attempt has left the window
  assert.equal(limiter.check('socket-a').allowed, true);
});

test('join limiter bounds its own key set and can prune stale sockets (#74)', () => {
  let now = 0;
  const limiter = new SlidingWindowRateLimiter(3, 100, 2, () => now);

  limiter.check('a');
  limiter.check('b');
  limiter.check('c');

  assert.equal(limiter.size, 2, 'the oldest key must be evicted at maxKeys');
  assert.equal(limiter.check('a').allowed, true, 'evicted keys start fresh');

  now = 200;
  limiter.prune();
  assert.equal(limiter.size, 0);

  limiter.check('socket-x');
  limiter.clear('socket-x');
  assert.equal(limiter.size, 0);
});
