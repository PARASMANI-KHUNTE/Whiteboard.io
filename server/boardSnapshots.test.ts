import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  beginRestore,
  clearMemorySnapshots,
  endRestore,
  getBoardSnapshot,
  isRoomRestoring,
  listBoardSnapshots,
  maybeCaptureSnapshot,
  recordBoardSnapshot,
  SNAPSHOT_EVENT_THRESHOLD,
  SNAPSHOT_TIME_THRESHOLD_MS,
} from "./boardSnapshots";

const actor = { id: "host-1", name: "Host", color: "#ff0000" };

test("snapshots are recorded, listed and fetched scoped to their room (#227)", async () => {
  const roomA = "snapshot-room-a";
  const roomB = "snapshot-room-b";
  clearMemorySnapshots(roomA);
  clearMemorySnapshots(roomB);

  const snapA = await recordBoardSnapshot(roomA, { e1: { id: "e1" } }, actor, 3, 1000);
  const snapB = await recordBoardSnapshot(roomB, { e2: { id: "e2" } }, undefined, 1, 2000);

  assert.equal(snapA.roomId, roomA);
  assert.equal(snapA.actor?.name, "Host");
  assert.deepEqual((await listBoardSnapshots(roomA, 20)).map((s) => s.id), [snapA.id]);
  assert.deepEqual((await listBoardSnapshots(roomB, 20)).map((s) => s.id), [snapB.id]);
  assert.equal((await getBoardSnapshot(roomA, snapA.id))?.eventCount, 3);
  assert.equal((await getBoardSnapshot(roomA, snapB.id)), null);
  assert.equal((await getBoardSnapshot(roomB, snapA.id)), null);
});

test("in-memory snapshots are capped at 20 per room, newest first (#227)", async () => {
  const roomId = "snapshot-cap-room";
  clearMemorySnapshots(roomId);

  const ids: string[] = [];
  for (let i = 0; i < 25; i++) {
    const snapshot = await recordBoardSnapshot(roomId, { [`e${i}`]: { id: `e${i}` } }, actor, i, 1000 + i);
    ids.push(snapshot.id);
  }

  const snapshots = await listBoardSnapshots(roomId, 100);
  assert.equal(snapshots.length, 20);
  assert.equal(snapshots[0].id, ids[24]);
  assert.equal(snapshots[snapshots.length - 1].id, ids[5]);
  assert.equal(await getBoardSnapshot(roomId, ids[0]), null);
});

test("stored elements are deep-cloned away from later mutations (#227)", async () => {
  const roomId = "snapshot-clone-room";
  clearMemorySnapshots(roomId);

  const elements: Record<string, any> = { e1: { id: "e1", x: 1, nested: { value: "a" } } };
  const snapshot = await recordBoardSnapshot(roomId, elements, actor, 1, 1000);

  elements.e1.x = 99;
  elements.e1.nested.value = "changed";
  elements.e2 = { id: "e2" };

  const loaded = await getBoardSnapshot(roomId, snapshot.id);
  assert.equal(loaded?.elements.e1.x, 1);
  assert.equal(loaded?.elements.e1.nested.value, "a");
  assert.equal(loaded?.elements.e2, undefined);
});

test("maybeCaptureSnapshot captures at 25 events or 30 seconds, whichever first (#227)", async () => {
  const eventRoom = "snapshot-event-threshold";
  const timeRoom = "snapshot-time-threshold";
  clearMemorySnapshots(eventRoom);
  clearMemorySnapshots(timeRoom);

  const elements = { e1: { id: "e1" } };
  for (let i = 1; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    await maybeCaptureSnapshot(eventRoom, elements, actor, 1000 + i);
  }
  assert.equal((await listBoardSnapshots(eventRoom, 100)).length, 0);
  await maybeCaptureSnapshot(eventRoom, elements, actor, 1030);
  const eventSnapshots = await listBoardSnapshots(eventRoom, 100);
  assert.equal(eventSnapshots.length, 1);
  assert.equal(eventSnapshots[0].eventCount, SNAPSHOT_EVENT_THRESHOLD);

  const base = 5000;
  await maybeCaptureSnapshot(timeRoom, elements, actor, base);
  await maybeCaptureSnapshot(timeRoom, elements, actor, base + SNAPSHOT_TIME_THRESHOLD_MS - 1);
  assert.equal((await listBoardSnapshots(timeRoom, 100)).length, 0);
  await maybeCaptureSnapshot(timeRoom, elements, actor, base + SNAPSHOT_TIME_THRESHOLD_MS);
  const timeSnapshots = await listBoardSnapshots(timeRoom, 100);
  assert.equal(timeSnapshots.length, 1);
  assert.equal(timeSnapshots[0].timestamp, base + SNAPSHOT_TIME_THRESHOLD_MS);
});

test("restore lock blocks automatic snapshots and toggles per room (#227)", async () => {
  const roomId = "snapshot-lock-room";
  clearMemorySnapshots(roomId);

  beginRestore(roomId);
  try {
    assert.equal(isRoomRestoring(roomId), true);
    for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD + 5; i++) {
      await maybeCaptureSnapshot(roomId, { e1: { id: "e1" } }, actor, 1000 + i);
    }
    assert.equal((await listBoardSnapshots(roomId, 100)).length, 0);
  } finally {
    endRestore(roomId);
  }
  assert.equal(isRoomRestoring(roomId), false);
});

test("restore and snapshot wiring is present in socket and REST handlers (#227)", () => {
  const canvasSource = readFileSync(new URL("./sockets/canvasHandler.ts", import.meta.url), "utf8");
  const roomsSource = readFileSync(new URL("./routes/rooms.ts", import.meta.url), "utf8");
  const socketIndexSource = readFileSync(new URL("./sockets/index.ts", import.meta.url), "utf8");

  assert.match(canvasSource, /safeOn\("restore-snapshot"/);
  assert.match(canvasSource, /board-restored/);
  assert.match(canvasSource, /permission-denied/);
  assert.match(canvasSource, /type:\s*"restore"/);
  assert.match(roomsSource, /\/snapshots/);
  assert.match(roomsSource, /\/snapshots\/:snapshotId/);
  assert.match(socketIndexSource, /Board restore in progress/);
});
