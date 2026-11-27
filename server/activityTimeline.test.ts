import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boardEventToActivityEntry,
  appendActivityEntry,
  type ActivityEntry,
} from "../client/src/utils/activityFeed";

test("boardEventToActivityEntry maps server events into timeline entries with correct labels (#226)", () => {
  const actor = { id: "user-123", name: "Alice", color: "#3b82f6" };

  const createEntry = boardEventToActivityEntry({
    id: "ev-1",
    type: "create",
    actor,
    elementId: "sticky-1",
    elementType: "sticky note",
    timestamp: 1000,
  });
  assert.equal(createEntry.action, "created");
  assert.equal(createEntry.userName, "Alice");
  assert.equal(createEntry.userColor, "#3b82f6");
  assert.equal(createEntry.summary, "Added sticky note");

  const deleteEntry = boardEventToActivityEntry({
    id: "ev-2",
    type: "delete",
    actor,
    elementId: "sticky-1",
    elementType: "sticky note",
    timestamp: 2000,
  });
  assert.equal(deleteEntry.action, "deleted");
  assert.equal(deleteEntry.summary, "Deleted sticky note");

  const clearEntry = boardEventToActivityEntry({
    id: "ev-3",
    type: "clear",
    actor,
    timestamp: 3000,
  });
  assert.equal(clearEntry.action, "cleared");
  assert.equal(clearEntry.summary, "Cleared the whiteboard");

  const batchEntry = boardEventToActivityEntry({
    id: "ev-4",
    type: "batch-create",
    actor,
    elementIds: ["el-1", "el-2", "el-3"],
    timestamp: 4000,
  });
  assert.equal(batchEntry.action, "created");
  assert.equal(batchEntry.summary, "Added 3 elements");
});

test("appendActivityEntry prepends novel entries and coalesces rapid edits (#226)", () => {
  const e1: ActivityEntry = {
    id: "1",
    userId: "u1",
    userName: "Alice",
    userColor: "#ff0000",
    action: "edited",
    summary: "Edited sticky note",
    elementId: "elem-x",
    timestamp: 10_000,
  };
  const list1 = appendActivityEntry([], e1);
  assert.equal(list1.length, 1);

  // Edit to same element 2s later -> coalesces
  const e2: ActivityEntry = {
    id: "2",
    userId: "u1",
    userName: "Alice",
    userColor: "#ff0000",
    action: "edited",
    summary: "Edited sticky note (typing)",
    elementId: "elem-x",
    timestamp: 12_000,
  };
  const list2 = appendActivityEntry(list1, e2);
  assert.equal(list2.length, 1);
  assert.equal(list2[0].summary, "Edited sticky note (typing)");

  // Different user or action -> prepends
  const e3: ActivityEntry = {
    id: "3",
    userId: "u2",
    userName: "Bob",
    userColor: "#00ff00",
    action: "created",
    summary: "Added rectangle",
    elementId: "elem-y",
    timestamp: 13_000,
  };
  const list3 = appendActivityEntry(list2, e3);
  assert.equal(list3.length, 2);
  assert.equal(list3[0].id, "3");
});

test("ActivityTimelineDrawer component and App wiring verify full timeline integration (#226)", () => {
  const drawerSource = readFileSync(
    new URL("../client/src/components/ActivityTimelineDrawer.tsx", import.meta.url),
    "utf8"
  );
  assert.match(drawerSource, /actionFilter/);
  assert.match(drawerSource, /userFilter/);
  assert.match(drawerSource, /LocateFixed/);
  assert.match(drawerSource, /Deleted/);
  assert.match(drawerSource, /onFocusElement/);

  const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /socket\.on\('board-event'/);
  assert.match(appSource, /socket\.on\('element-deleted'/);
  assert.match(appSource, /socket\.on\('elements-batch-deleted'/);
  assert.match(appSource, /\/api\/rooms\/.*\/events/);
  assert.match(appSource, /<ActivityTimelineDrawer/);
});
