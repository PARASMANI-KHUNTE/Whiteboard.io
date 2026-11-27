import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_RECORDINGS_PER_ROOM,
  RECORDING_RETENTION_MS,
  addRoomRecording,
  beginRoomRecording,
  canManageRecordings,
  clearMemoryRecordings,
  createSignedDownloadUrl,
  endRoomRecording,
  getRoomRecordingState,
  isValidRecordingId,
  listRoomRecordings,
  verifySignedDownloadToken,
  type VoiceRecordingMeta,
} from "./voiceRecordings";

process.env.VOICE_RECORDING_SIGNING_SECRET = "voice-recording-test-secret";

const actor = { id: "host-1", name: "Host", color: "#ff0000" };

function meta(roomId: string, id: string, createdAt: number): VoiceRecordingMeta {
  return {
    id,
    roomId,
    actor,
    startedAt: createdAt - 5000,
    durationMs: 5000,
    sizeBytes: 1024,
    mimeType: "audio/webm",
    createdAt,
    storageKey: `${roomId}/${id}.webm`,
  };
}

test("signed download URLs verify the exact room, recording and expiry (#239)", () => {
  const now = 1_700_000_000_000;
  const url = new URL(createSignedDownloadUrl("room-a", "rec-1", now), "http://localhost");
  const expires = url.searchParams.get("expires");
  const token = url.searchParams.get("token");

  assert.equal(url.pathname, "/api/rooms/room-a/recordings/rec-1/download");
  assert.equal(verifySignedDownloadToken("room-a", "rec-1", expires, token, now + 1000), true);
  assert.equal(verifySignedDownloadToken("room-b", "rec-1", expires, token, now + 1000), false);
  assert.equal(verifySignedDownloadToken("room-a", "rec-2", expires, token, now + 1000), false);
  assert.equal(verifySignedDownloadToken("room-a", "rec-1", expires, token, Number(expires) + 1), false);
  assert.equal(verifySignedDownloadToken("room-a", "rec-1", expires, "bad-token", now + 1000), false);
});

test("only the host or an assigned admin can control recording (#239)", () => {
  const room = {
    creatorId: "host-1",
    userPermissions: {
      "admin-1": { role: "admin" },
      "editor-1": { role: "editor" },
    },
  };

  assert.equal(canManageRecordings(room, "host-1"), true);
  assert.equal(canManageRecordings(room, "admin-1"), true);
  assert.equal(canManageRecordings(room, "editor-1"), false);
  assert.equal(canManageRecordings(room, "guest-1"), false);
  assert.equal(canManageRecordings(room, ""), false);
});

test("recordings are scoped per room and capped at 20 newest entries (#239)", async () => {
  const roomA = "recordings-room-a";
  const roomB = "recordings-room-b";
  clearMemoryRecordings(roomA);
  clearMemoryRecordings(roomB);

  await addRoomRecording(meta(roomA, "rec-a", 1000));
  await addRoomRecording(meta(roomB, "rec-b", 2000));
  for (let i = 0; i < MAX_RECORDINGS_PER_ROOM + 5; i++) {
    await addRoomRecording(meta(roomA, `rec-a-${i}`, 3000 + i));
  }

  const now = 10_000;
  const listA = await listRoomRecordings(roomA, 100, now);
  const listB = await listRoomRecordings(roomB, 100, now);
  assert.equal(listA.length, MAX_RECORDINGS_PER_ROOM);
  assert.equal(listA[0].id, `rec-a-${MAX_RECORDINGS_PER_ROOM + 4}`);
  assert.deepEqual(listB.map((item) => item.id), ["rec-b"]);
});

test("expired recordings are excluded from the room list (#239)", async () => {
  const roomId = "recordings-retention-room";
  clearMemoryRecordings(roomId);
  const now = 2_000_000_000_000;
  await addRoomRecording(meta(roomId, "rec-old", now - RECORDING_RETENTION_MS - 1));
  await addRoomRecording(meta(roomId, "rec-new", now - 1000));

  assert.deepEqual(
    (await listRoomRecordings(roomId, 20, now)).map((item) => item.id),
    ["rec-new"]
  );
});

test("recording ids are strictly validated before file access (#239)", () => {
  assert.equal(isValidRecordingId("room-1"), true);
  assert.equal(isValidRecordingId("rec_01"), true);
  assert.equal(isValidRecordingId("../etc/passwd"), false);
  assert.equal(isValidRecordingId("a"), false);
  assert.equal(isValidRecordingId(42), false);
});

test("recording state starts, reports and ends for one room (#239)", () => {
  const roomId = "recording-state-room";
  clearMemoryRecordings(roomId);

  const started = beginRoomRecording(roomId, actor, 1234);
  assert.deepEqual(getRoomRecordingState(roomId), {
    isRecording: true,
    userId: actor.id,
    userName: actor.name,
    startedAt: 1234,
  });

  assert.deepEqual(endRoomRecording(roomId), { isRecording: false });
  assert.equal(getRoomRecordingState(roomId), null);
});

test("recording endpoints, socket toggle and playback UI are wired (#239)", () => {
  const routes = readFileSync(new URL("./routes/rooms.ts", import.meta.url), "utf8");
  const voice = readFileSync(new URL("./sockets/voiceHandler.ts", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../client/src/components/Sidebar.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../client/src/hooks/useVoiceChat.ts", import.meta.url), "utf8");

  assert.match(routes, /\/api\/rooms\/:roomId\/recordings/);
  assert.match(routes, /verifySignedDownloadToken/);
  assert.match(voice, /safeOn\("recording-toggle"/);
  assert.match(voice, /recording-state/);
  assert.match(sidebar, /actions\.actions\.recordings/);
  assert.match(app, /RecordingsPanel/);
  assert.match(hook, /MediaRecorder/);
});
