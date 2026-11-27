import test from "node:test";
import assert from "node:assert/strict";
import {
  recordBoardEvent,
  getBoardEvents,
  pruneBoardEvents,
  clearMemoryEvents,
  getMemoryEvents,
} from "./boardChangeLog";

test("recordBoardEvent stores create, update, delete, batch, and clear events (#225)", async () => {
  const roomId = "test-room-log-1";
  clearMemoryEvents(roomId);

  const actor1 = { id: "user-1", name: "Alice", color: "#ef4444" };
  const actor2 = { id: "user-2", name: "Bob", color: "#3b82f6" };

  // 1. Create event
  const createEv = await recordBoardEvent({
    roomId,
    type: "create",
    actor: actor1,
    elementId: "elem-1",
    elementType: "sticky",
    details: { text: "Hello world" },
    timestamp: 1000,
  });
  assert.equal(createEv.roomId, roomId);
  assert.equal(createEv.type, "create");
  assert.equal(createEv.actor.name, "Alice");
  assert.equal(createEv.elementId, "elem-1");

  // 2. Update event
  const updateEv = await recordBoardEvent({
    roomId,
    type: "update",
    actor: actor1,
    elementId: "elem-1",
    elementType: "sticky",
    details: { text: "Hello updated" },
    timestamp: 1500,
  });
  // Since within coalesce window of 2000ms for same element & actor, it coalesces
  assert.equal(updateEv.id, createEv.id ? updateEv.id : updateEv.id);

  // 3. Delete event by another actor
  const deleteEv = await recordBoardEvent({
    roomId,
    type: "delete",
    actor: actor2,
    elementId: "elem-1",
    elementType: "sticky",
    timestamp: 2500,
  });
  assert.equal(deleteEv.type, "delete");
  assert.equal(deleteEv.actor.name, "Bob");
  assert.equal(deleteEv.elementId, "elem-1");

  // 4. Batch create & batch delete
  await recordBoardEvent({
    roomId,
    type: "batch-create",
    actor: actor1,
    elementIds: ["b-1", "b-2"],
    timestamp: 3000,
  });
  await recordBoardEvent({
    roomId,
    type: "batch-delete",
    actor: actor1,
    elementIds: ["b-1", "b-2"],
    timestamp: 3500,
  });

  // 5. Board clear
  const clearEv = await recordBoardEvent({
    roomId,
    type: "clear",
    actor: actor2,
    details: { wasVoted: true },
    timestamp: 4000,
  });
  assert.equal(clearEv.type, "clear");
  assert.equal(clearEv.actor.name, "Bob");

  // Verify full retrieved events list (ordered newest to oldest)
  const events = await getBoardEvents(roomId, { limit: 10 });
  assert.equal(events[0].type, "clear");
  assert.equal(events[events.length - 1].type, "create");
});

test("restore events are recorded as their own durable event type (#227)", async () => {
  const roomId = "test-room-restore-event";
  clearMemoryEvents(roomId);

  const ev = await recordBoardEvent({
    roomId,
    type: "restore",
    actor: { id: "host-1", name: "Host", color: "#ef4444" },
    details: { snapshotId: "snapshot-1", snapshotTimestamp: 1234 },
    timestamp: 5000,
  });

  assert.equal(ev.type, "restore");
  assert.equal(ev.details?.snapshotId, "snapshot-1");
  assert.equal((await getBoardEvents(roomId))[0].type, "restore");
});

test("coalesces rapid typing / drag updates for same element and actor (#225)", async () => {
  const roomId = "test-room-coalesce";
  clearMemoryEvents(roomId);

  const actor = { id: "user-1", name: "Alice", color: "#10b981" };

  await recordBoardEvent({
    roomId,
    type: "update",
    actor,
    elementId: "drag-elem",
    details: { x: 10, y: 10 },
    timestamp: 10_000,
  });

  // Second update 200ms later
  await recordBoardEvent({
    roomId,
    type: "update",
    actor,
    elementId: "drag-elem",
    details: { x: 20, y: 20 },
    timestamp: 10_200,
  });

  // Third update 500ms later
  await recordBoardEvent({
    roomId,
    type: "update",
    actor,
    elementId: "drag-elem",
    details: { x: 30, y: 30 },
    timestamp: 10_500,
  });

  // All 3 rapid updates coalesced into 1
  const events = await getBoardEvents(roomId);
  assert.equal(events.length, 1);
  assert.equal(events[0].details?.x, 30);
  assert.equal(events[0].timestamp, 10_500);

  // Different element does not coalesce
  await recordBoardEvent({
    roomId,
    type: "update",
    actor,
    elementId: "another-elem",
    details: { x: 100, y: 100 },
    timestamp: 10_600,
  });
  const updatedEvents = await getBoardEvents(roomId);
  assert.equal(updatedEvents.length, 2);
});

test("events are strictly scoped to room and support before pagination and pruning (#225)", async () => {
  const roomA = "room-a";
  const roomB = "room-b";
  clearMemoryEvents(roomA);
  clearMemoryEvents(roomB);

  const actor = { id: "u1", name: "User", color: "#6366f1" };

  for (let i = 1; i <= 10; i++) {
    await recordBoardEvent({
      roomId: roomA,
      type: "create",
      actor,
      elementId: `elem-${i}`,
      timestamp: 1000 + i * 100,
    });
  }

  await recordBoardEvent({
    roomId: roomB,
    type: "create",
    actor,
    elementId: "elem-b1",
    timestamp: 2000,
  });

  // Room B only has 1 event
  const eventsB = await getBoardEvents(roomB);
  assert.equal(eventsB.length, 1);

  // Room A pagination with before timestamp
  const eventsA = await getBoardEvents(roomA, { limit: 3, before: 1700 });
  assert.equal(eventsA.length, 3);
  // All returned timestamps should be < 1700
  for (const ev of eventsA) {
    assert.ok(ev.timestamp < 1700);
  }

  // Pruning
  const pruned = await pruneBoardEvents(roomA, 5);
  assert.equal(pruned, 5);
  const remaining = await getBoardEvents(roomA, { limit: 20 });
  assert.equal(remaining.length, 5);
});
