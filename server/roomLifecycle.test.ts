import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomLifecycleManager } from './roomLifecycle';

interface MockRoom {
  users: Record<string, { id: string }>;
}

test('scheduleCleanup deletes an empty room after the TTL (#104)', async () => {
  const rooms = new Map<string, MockRoom>();
  rooms.set('ROOM1', { users: {} });
  const manager = new RoomLifecycleManager(rooms, 20);

  let cleaned: string | null = null;
  manager.scheduleCleanup('ROOM1', (id) => {
    cleaned = id;
  });

  assert.equal(manager.hasPendingCleanup('ROOM1'), true);
  assert.equal(rooms.has('ROOM1'), true);

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(rooms.has('ROOM1'), false);
  assert.equal(cleaned, 'ROOM1');
  assert.equal(manager.hasPendingCleanup('ROOM1'), false);
  assert.equal(manager.pendingCount, 0);
});

test('cancelCleanup prevents room deletion when a user rejoins (#104)', async () => {
  const rooms = new Map<string, MockRoom>();
  const room: MockRoom = { users: {} };
  rooms.set('ROOM2', room);
  const manager = new RoomLifecycleManager(rooms, 30);

  manager.scheduleCleanup('ROOM2');
  assert.equal(manager.hasPendingCleanup('ROOM2'), true);

  // User rejoins before timer fires
  room.users['user1'] = { id: 'user1' };
  const cancelled = manager.cancelCleanup('ROOM2');
  assert.equal(cancelled, true);
  assert.equal(manager.hasPendingCleanup('ROOM2'), false);

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(rooms.has('ROOM2'), true);
});

test('re-scheduling cleanup replaces and cancels the old timer (#104)', async () => {
  const rooms = new Map<string, MockRoom>();
  rooms.set('ROOM3', { users: {} });
  const manager = new RoomLifecycleManager(rooms, 50);

  manager.scheduleCleanup('ROOM3');
  assert.equal(manager.pendingCount, 1);

  // Re-scheduling for the same room should cancel the old timer and not spawn duplicates
  manager.scheduleCleanup('ROOM3');
  assert.equal(manager.pendingCount, 1);

  manager.cancelCleanup('ROOM3');
  assert.equal(manager.pendingCount, 0);
});

test('clearAll cancels every pending timer on graceful shutdown (#104)', async () => {
  const rooms = new Map<string, MockRoom>();
  rooms.set('R1', { users: {} });
  rooms.set('R2', { users: {} });
  const manager = new RoomLifecycleManager(rooms, 100);

  manager.scheduleCleanup('R1');
  manager.scheduleCleanup('R2');
  assert.equal(manager.pendingCount, 2);

  manager.clearAll();
  assert.equal(manager.pendingCount, 0);
  assert.equal(manager.hasPendingCleanup('R1'), false);
  assert.equal(manager.hasPendingCleanup('R2'), false);

  await new Promise((resolve) => setTimeout(resolve, 20));
  // Rooms remain untouched because timers were cancelled before firing
  assert.equal(rooms.has('R1'), true);
  assert.equal(rooms.has('R2'), true);
});

test('scheduleCleanup does not delete room if users re-entered without calling cancel (#104)', async () => {
  const rooms = new Map<string, MockRoom>();
  const room: MockRoom = { users: {} };
  rooms.set('ROOM4', room);
  const manager = new RoomLifecycleManager(rooms, 20);

  manager.scheduleCleanup('ROOM4');
  // Simulate user joining without explicit cancelCleanup call
  room.users['userX'] = { id: 'userX' };

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(rooms.has('ROOM4'), true);
  assert.equal(manager.pendingCount, 0);
});
