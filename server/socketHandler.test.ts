import assert from 'node:assert/strict';
import test from 'node:test';
import { guardSocketHandler } from './socketHandler';

test('sync handler exceptions are reported, never thrown', () => {
  const errors: unknown[] = [];
  const wrapped = guardSocketHandler(
    (_payload: unknown) => {
      throw new Error('malformed payload');
    },
    (err) => errors.push(err)
  );

  assert.doesNotThrow(() => wrapped({ bad: true }));
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /malformed payload/);
});

test('async handler rejections are reported instead of becoming unhandled', async () => {
  const errors: unknown[] = [];
  const wrapped = guardSocketHandler(
    async () => {
      throw new Error('db down');
    },
    (err) => errors.push(err)
  );

  wrapped();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /db down/);
});

test('successful handlers pass arguments through and report nothing', () => {
  const errors: unknown[] = [];
  const received: unknown[] = [];
  const wrapped = guardSocketHandler(
    (a: number, b: string) => {
      received.push(a, b);
    },
    (err) => errors.push(err)
  );

  wrapped(7, 'x');
  assert.deepEqual(received, [7, 'x']);
  assert.equal(errors.length, 0);
});
