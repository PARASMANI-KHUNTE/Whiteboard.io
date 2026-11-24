import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrCreateCached } from './roomCreation';

interface TestRoom {
  id: string;
}

test('two parallel joins to a new room share one canonical room (#71)', async () => {
  const cache = new Map<string, TestRoom>();
  const inFlight = new Map<string, Promise<TestRoom>>();
  let loadCalls = 0;
  let resolveLoad!: (room: TestRoom) => void;

  const create = () => {
    loadCalls += 1;
    return new Promise<TestRoom>((resolve) => {
      resolveLoad = resolve;
    });
  };

  const first = getOrCreateCached('ROOM1', cache, inFlight, create);
  const second = getOrCreateCached('ROOM1', cache, inFlight, create);

  assert.equal(loadCalls, 1, 'the room should only be loaded once');
  assert.strictEqual(inFlight.get('ROOM1'), first);
  assert.strictEqual(inFlight.get('ROOM1'), second);

  resolveLoad({ id: 'ROOM1' });
  const [a, b] = await Promise.all([first, second]);

  assert.strictEqual(a, b);
  assert.strictEqual(cache.get('ROOM1'), a);
  assert.equal(inFlight.size, 0);
});

test('a cached room is reused without starting a new load', async () => {
  const room: TestRoom = { id: 'ROOM2' };
  const cache = new Map<string, TestRoom>([['ROOM2', room]]);
  const inFlight = new Map<string, Promise<TestRoom>>();
  let loadCalls = 0;

  const resolved = await getOrCreateCached('ROOM2', cache, inFlight, () => {
    loadCalls += 1;
    return Promise.resolve({ id: 'other' });
  });

  assert.strictEqual(resolved, room);
  assert.equal(loadCalls, 0);
});

test('a failed creation is retried by the next caller', async () => {
  const cache = new Map<string, TestRoom>();
  const inFlight = new Map<string, Promise<TestRoom>>();
  let attempts = 0;

  const create = () => {
    attempts += 1;
    return attempts === 1
      ? Promise.reject(new Error('db down'))
      : Promise.resolve({ id: 'ROOM3' });
  };

  await assert.rejects(getOrCreateCached('ROOM3', cache, inFlight, create), /db down/);
  assert.equal(inFlight.size, 0);

  const room = await getOrCreateCached('ROOM3', cache, inFlight, create);
  assert.equal(room.id, 'ROOM3');
  assert.equal(attempts, 2);
  assert.strictEqual(cache.get('ROOM3'), room);
});
