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

test('ensureCapacity evicts the least recently used idle room (#74)', () => {
  const rooms = new Map<string, MockRoom>([
    ['OLD', { users: {} }],
    ['NEW', { users: {} }],
  ]);
  const manager = new RoomLifecycleManager(rooms);
  manager.touch('OLD', 1);
  manager.touch('NEW', 2);
  manager.scheduleCleanup('OLD');

  assert.equal(manager.ensureCapacity('INCOMING', 2, 0, 3), true);
  assert.equal(rooms.has('OLD'), false, 'least recently used idle room is reclaimed');
  assert.equal(rooms.has('NEW'), true);
  assert.equal(manager.hasPendingCleanup('OLD'), false, 'timer for evicted room is cancelled');
});

test('touch promotes a room so it is not the next eviction victim (#74)', () => {
  const rooms = new Map<string, MockRoom>([
    ['A', { users: {} }],
    ['B', { users: {} }],
  ]);
  const manager = new RoomLifecycleManager(rooms);
  manager.touch('A', 1);
  manager.touch('B', 2);
  manager.touch('A', 3);

  assert.equal(manager.ensureCapacity('C', 2, 0, 4), true);
  assert.equal(rooms.has('A'), true);
  assert.equal(rooms.has('B'), false);
});

test('ensureCapacity rejects new rooms when no idle room can be reclaimed (#74)', () => {
  const rooms = new Map<string, MockRoom>([
    ['ACTIVE1', { users: { u1: { id: 'u1' } } }],
    ['ACTIVE2', { users: { u2: { id: 'u2' } } }],
  ]);
  const manager = new RoomLifecycleManager(rooms);
  manager.touch('ACTIVE1', 1);
  manager.touch('ACTIVE2', 2);

  assert.equal(manager.ensureCapacity('INCOMING', 2, 0, 3), false);
  assert.equal(rooms.has('ACTIVE1'), true);
  assert.equal(rooms.has('ACTIVE2'), true);

  const vetoed = new Map<string, MockRoom>([
    ['KEEP', { users: {} }],
    ['OTHER', { users: {} }],
  ]);
  const vetoManager = new RoomLifecycleManager(vetoed);
  vetoManager.touch('KEEP', 1);
  vetoManager.touch('OTHER', 2);

  assert.equal(
    vetoManager.ensureCapacity('INCOMING', 2, 0, 3, (id) => id !== 'KEEP' && id !== 'OTHER'),
    false
  );
  assert.equal(vetoed.has('KEEP'), true);
  assert.equal(vetoed.has('OTHER'), true);
});

test('ensureCapacity counts in-flight room loads against the cap (#74)', () => {
  const rooms = new Map<string, MockRoom>([['IDLE', { users: {} }]]);
  const manager = new RoomLifecycleManager(rooms);
  manager.touch('IDLE', 1);

  assert.equal(manager.ensureCapacity('INCOMING', 2, 1, 2), true);
  assert.equal(rooms.has('IDLE'), false, 'the pending load needs the reclaimed slot');
});
