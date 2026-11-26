import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  appendActivityEntry,
  buildInitialActivityFromElements,
  describeElementKind,
} from '../client/src/utils/activityFeed';
import type { ShapeElement, StickyNote } from '../client/src/types';

test('activityFeed builds initial entries and coalesces rapid repeated edits (#224)', () => {
  const shape: ShapeElement = {
    id: 's1',
    type: 'shape',
    shapeType: 'rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    color: '#2563eb',
    strokeWidth: 2,
    userId: 'u_alice',
    userName: 'Alice',
    updatedAt: 1000,
    attribution: {
      createdBy: 'u_alice',
      createdByName: 'Alice',
      createdByColor: '#3b82f6',
      createdAt: 1000,
      lastModifiedBy: 'u_bob',
      lastModifiedByName: 'Bob',
      lastModifiedByColor: '#10b981',
      lastModifiedAt: 5000,
    },
  };
  const sticky: StickyNote = {
    id: 'st1',
    type: 'sticky',
    x: 50,
    y: 50,
    width: 224,
    height: 150,
    text: 'Architecture plan',
    color: '#fef08a',
    userId: 'u_alice',
    userName: 'Alice',
    updatedAt: 9000,
  };

  assert.equal(describeElementKind(shape), 'Rectangle shape');
  assert.match(describeElementKind(sticky), /Sticky note/);

  const initial = buildInitialActivityFromElements({ s1: shape, st1: sticky });
  assert.equal(initial.length, 2);
  assert.equal(initial[0].elementId, 'st1'); // sorted newest first
  assert.equal(initial[1].userName, 'Bob'); // modified after creation

  // Consecutive edits by same user on same element within 10s coalesce cleanly
  let feed = appendActivityEntry([], {
    id: 'e1',
    userId: 'u_alice',
    userName: 'Alice',
    userColor: '#3b82f6',
    action: 'edited',
    summary: 'Edited Rectangle shape',
    elementId: 's1',
    timestamp: 10_000,
  });
  feed = appendActivityEntry(feed, {
    id: 'e2',
    userId: 'u_alice',
    userName: 'Alice',
    userColor: '#3b82f6',
    action: 'edited',
    summary: 'Edited Rectangle shape',
    elementId: 's1',
    timestamp: 12_000,
  });
  assert.equal(feed.length, 1);
  assert.equal(feed[0].timestamp, 12_000);
});

test('App wires Ctrl+K CommandPaletteModal and ActivityTimelineDrawer (#224)', () => {
  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<CommandPaletteModal/);
  assert.match(app, /<ActivityTimelineDrawer/);
  assert.match(app, /e\.key\.toLowerCase\(\) === 'k'/);
  assert.match(app, /id="activity-timeline-btn"/);
});
