import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemoryRateLimitStore,
  DistributedRateLimitStore,
  createAuthRateLimiter,
} from './authRateLimiter';

test('MemoryRateLimitStore enforces window counts, resets after expiry, and bounds maxKeys (#236)', async () => {
  const store = new MemoryRateLimitStore(2);

  const r1 = await store.increment('auth:1.2.3.4', 1000, 100);
  const r2 = await store.increment('auth:1.2.3.4', 1000, 200);
  assert.equal(r1.count, 1);
  assert.equal(r2.count, 2);

  // Window reset
  const r3 = await store.increment('auth:1.2.3.4', 1000, 1200);
  assert.equal(r3.count, 1);

  // Bounded eviction when exceeding maxKeys=2
  await store.increment('auth:5.6.7.8', 1000, 1200);
  await store.increment('auth:9.10.11.12', 1000, 1200);
  assert.equal(store.size, 2);

  store.prune(2500);
  assert.equal(store.size, 0);
});

test('DistributedRateLimitStore uses Mongo collection when available and falls back cleanly on error', async () => {
  const fallback = new MemoryRateLimitStore(100);
  let calls = 0;
  const fakeCol = {
    async findOneAndUpdate() {
      calls += 1;
      return { count: 3, expiresAt: new Date(5000) };
    },
  };

  const store = new DistributedRateLimitStore(() => fakeCol, fallback);
  const res = await store.increment('auth-login:10.0.0.1', 60_000, 1000);
  assert.equal(calls, 1);
  assert.equal(res.count, 3);
  assert.equal(res.resetTime, 5000);

  const failingStore = new DistributedRateLimitStore(
    () => ({
      async findOneAndUpdate() {
        throw new Error('db down');
      },
    }),
    fallback
  );
  const fallbackRes = await failingStore.increment('auth-login:10.0.0.2', 60_000, 1000);
  assert.equal(fallbackRes.count, 1);
});

test('createAuthRateLimiter returns 429 once maxRequests is exceeded', async () => {
  const store = new MemoryRateLimitStore(100);
  const limiter = createAuthRateLimiter(store, () => 1000)(2, 60_000, 'auth-login');

  let nextCalls = 0;
  let statusCode = 200;
  let body: any = null;
  const req: any = { ip: '127.0.0.1', socket: {} };
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      body = payload;
    },
  };

  await limiter(req, res, () => { nextCalls += 1; });
  await limiter(req, res, () => { nextCalls += 1; });
  await limiter(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(statusCode, 429);
  assert.equal(body?.success, false);
});
