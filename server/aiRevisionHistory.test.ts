import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_AI_REVISIONS_PER_ROOM,
  clearMemoryDiagramRevisions,
  getDiagramRevision,
  listDiagramRevisions,
  recordDiagramRevision,
} from "./aiRevisionHistory";

const actor = { id: "host-1", name: "Host", color: "#ff0000" };

function sticky(sessionId: string, index: number) {
  return {
    id: `ai_${sessionId}_node-${index}`,
    type: "sticky",
    x: index * 10,
    y: 20,
    width: 80,
    height: 40,
    text: `Node ${index}`,
    color: "#ffffff",
    userId: actor.id,
    updatedAt: 1000 + index,
  };
}

test("AI revisions are recorded and fetched scoped to their room (#241)", async () => {
  const roomA = "ai-revision-room-a";
  const roomB = "ai-revision-room-b";
  clearMemoryDiagramRevisions(roomA);
  clearMemoryDiagramRevisions(roomB);

  const revisionA = await recordDiagramRevision(roomA, {
    sessionId: "session-a",
    prompt: "Draw a login flow",
    title: "Login flow",
    author: actor,
    elements: [sticky("session-a", 1)],
    now: 1000,
  });
  const revisionB = await recordDiagramRevision(roomB, {
    sessionId: "session-b",
    prompt: "Draw a checkout flow",
    author: actor,
    elements: [sticky("session-b", 2)],
    now: 2000,
  });

  assert.ok(revisionA);
  assert.ok(revisionB);
  assert.equal(revisionA.roomId, roomA);
  assert.equal(revisionA.prompt, "Draw a login flow");
  assert.equal(revisionA.title, "Login flow");
  assert.equal(revisionA.author?.name, "Host");
  assert.equal(revisionA.elements.length, 1);
  assert.deepEqual((await listDiagramRevisions(roomA, 20)).map((item) => item.id), [revisionA.id]);
  assert.deepEqual((await listDiagramRevisions(roomB, 20)).map((item) => item.id), [revisionB.id]);
  assert.equal((await getDiagramRevision(roomA, revisionB.id)), null);
  assert.equal((await getDiagramRevision(roomB, revisionA.id)), null);
  assert.equal((await getDiagramRevision(roomA, revisionA.id))?.prompt, "Draw a login flow");
});

test("AI revisions are capped per room, newest first (#241)", async () => {
  const roomId = "ai-revision-cap-room";
  clearMemoryDiagramRevisions(roomId);

  const ids: string[] = [];
  for (let index = 0; index < MAX_AI_REVISIONS_PER_ROOM + 5; index++) {
    const revision = await recordDiagramRevision(roomId, {
      sessionId: "cap-session",
      prompt: `Revision ${index}`,
      author: actor,
      elements: [sticky("cap-session", index)],
      now: 1000 + index,
    });
    assert.ok(revision);
    ids.push(revision.id);
  }

  const revisions = await listDiagramRevisions(roomId, 100);
  assert.equal(revisions.length, MAX_AI_REVISIONS_PER_ROOM);
  assert.equal(revisions[0].id, ids[ids.length - 1]);
  assert.equal(revisions[revisions.length - 1].id, ids[5]);
  assert.equal(await getDiagramRevision(roomId, ids[0]), null);
});

test("revision storage keeps only sanitized elements for the AI session (#241)", async () => {
  const roomId = "ai-revision-sanitize-room";
  clearMemoryDiagramRevisions(roomId);

  const empty = await recordDiagramRevision(roomId, {
    sessionId: "sanitize-session",
    prompt: "No valid elements",
    elements: [{ id: "manual_element", type: "sticky" }],
  });
  assert.equal(empty, null);

  const revision = await recordDiagramRevision(roomId, {
    sessionId: "sanitize-session",
    prompt: "Mixed elements",
    elements: [sticky("other-session", 1), sticky("sanitize-session", 2)],
  });
  assert.ok(revision);
  assert.equal(revision.elements.length, 1);
  assert.equal(revision.elements[0].id, "ai_sanitize-session_node-2");
});

test("revision panel, socket events and persistent history are wired (#241)", () => {
  const canvasSource = readFileSync(new URL("./sockets/canvasHandler.ts", import.meta.url), "utf8");
  const roomsSource = readFileSync(new URL("./routes/rooms.ts", import.meta.url), "utf8");
  const socketSource = readFileSync(new URL("../client/src/hooks/useSocket.ts", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const panelSource = readFileSync(
    new URL("../client/src/components/AiRevisionHistoryPanel.tsx", import.meta.url),
    "utf8"
  );

  assert.match(canvasSource, /record-ai-revision/);
  assert.match(canvasSource, /restore-ai-revision/);
  assert.match(canvasSource, /restore_ai_revision/);
  assert.match(canvasSource, /ai-revision-restored/);
  assert.match(canvasSource, /type:\s*"restore"/);
  assert.match(canvasSource, /prefix = `ai_\$\{revision\.sessionId\}_`/);
  assert.match(roomsSource, /\/ai-revisions/);
  assert.match(roomsSource, /\/ai-revisions\/:revisionId/);
  assert.match(socketSource, /emitRecordAiRevision/);
  assert.match(socketSource, /emitRestoreAiRevision/);
  assert.match(appSource, /aiHistoryPastRef/);
  assert.match(appSource, /aiUndoNextRef/);
  assert.match(appSource, /AiRevisionHistoryPanel/);
  assert.match(panelSource, /aria-label="AI diagram revision history"/);
});
