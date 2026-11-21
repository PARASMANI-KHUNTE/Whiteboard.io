import assert from 'node:assert/strict';
import test from 'node:test';
import { QueueFullError, ThrottledQueue } from './requestQueue';

test('rejects work once the queue depth limit is reached', async () => {
  const queue = new ThrottledQueue(0, 1);
  let releaseFirst: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const first = queue.schedule(0, () => new Promise<void>((resolve) => {
    releaseFirst = resolve;
    markStarted?.();
  }));

  await started;
  await assert.rejects(() => queue.schedule(0, async () => 'second'), QueueFullError);

  releaseFirst?.();
  await first;
  assert.equal(queue.size, 0);
});

test('accepts the next request after the running task settles', async () => {
  const queue = new ThrottledQueue(0, 1);
  assert.equal(await queue.schedule(0, async () => 'first'), 'first');
  assert.equal(await queue.schedule(0, async () => 'second'), 'second');
});
