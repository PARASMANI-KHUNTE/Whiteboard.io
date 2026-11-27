import crypto from "crypto";
import { getBoardSnapshotsCollection } from "./db";
import type { BoardActor } from "./boardChangeLog";

export interface BoardSnapshotDoc {
  id: string;
  roomId: string;
  elements: Record<string, any>;
  actor?: BoardActor;
  eventCount: number;
  timestamp: number;
  createdAt: Date;
}

/** Number of board events between automatic snapshots. */
export const SNAPSHOT_EVENT_THRESHOLD = 25;
/** Maximum time between automatic snapshots. */
export const SNAPSHOT_TIME_THRESHOLD_MS = 30_000;
/** In-memory snapshots retained per room (mirrors the board_events cap). */
export const MAX_SNAPSHOTS_PER_ROOM = 20;

interface CaptureState {
  eventCount: number;
  lastCapturedAt: number;
}

const memorySnapshots = new Map<string, BoardSnapshotDoc[]>();
const captureState = new Map<string, CaptureState>();
const restoringRooms = new Set<string>();

function cloneElements(elements: Record<string, any> | undefined | null): Record<string, any> {
  if (!elements || typeof elements !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(elements)) as Record<string, any>;
  } catch (err: any) {
    console.warn("[BoardSnapshots] Could not clone elements:", err?.message || err);
    return {};
  }
}

function getCaptureState(roomId: string, now: number): CaptureState {
  let state = captureState.get(roomId);
  if (!state) {
    state = { eventCount: 0, lastCapturedAt: now };
    captureState.set(roomId, state);
  }
  return state;
}

/**
 * Store a snapshot, first in memory (always available) and then in MongoDB when
 * connected. Persistence is best-effort so a DB outage never breaks a board.
 */
export async function recordBoardSnapshot(
  roomId: string,
  elements: Record<string, any>,
  actor?: BoardActor,
  eventCount = 0,
  now = Date.now()
): Promise<BoardSnapshotDoc> {
  const doc: BoardSnapshotDoc = {
    id: crypto.randomUUID(),
    roomId,
    elements: cloneElements(elements),
    actor: actor
      ? {
          id: actor.id,
          name: (actor.name || "Unknown").slice(0, 80),
          color: actor.color || "#6b7280",
        }
      : undefined,
    eventCount: Math.max(0, eventCount),
    timestamp: now,
    createdAt: new Date(now),
  };

  const roomSnapshots = memorySnapshots.get(roomId) || [];
  roomSnapshots.push(doc);
  if (roomSnapshots.length > MAX_SNAPSHOTS_PER_ROOM) {
    roomSnapshots.splice(0, roomSnapshots.length - MAX_SNAPSHOTS_PER_ROOM);
  }
  memorySnapshots.set(roomId, roomSnapshots);

  // A manually recorded snapshot also starts a new automatic capture window.
  captureState.set(roomId, { eventCount: 0, lastCapturedAt: now });

  try {
    const collection = getBoardSnapshotsCollection();
    if (collection) {
      await collection.insertOne(doc);
    }
  } catch (err: any) {
    console.warn(
      `[BoardSnapshots] Failed to persist snapshot to MongoDB for room ${roomId}:`,
      err?.message || err
    );
  }

  return doc;
}

/** Retrieve snapshots for a room, newest first, without server boot or Mongo required. */
export async function listBoardSnapshots(roomId: string, limit = 20): Promise<BoardSnapshotDoc[]> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  try {
    const collection = getBoardSnapshotsCollection();
    if (collection) {
      const docs = await collection
        .find({ roomId })
        .sort({ timestamp: -1 })
        .limit(safeLimit)
        .toArray();
      if (docs.length > 0) {
        return docs.map(({ _id, ...rest }: any) => rest as BoardSnapshotDoc);
      }
    }
  } catch (err: any) {
    console.warn(`[BoardSnapshots] Fallback to memory for room ${roomId}:`, err?.message || err);
  }

  return [...(memorySnapshots.get(roomId) || [])].reverse().slice(0, safeLimit);
}

/** Fetch one snapshot, scoped to its room. */
export async function getBoardSnapshot(
  roomId: string,
  snapshotId: string
): Promise<BoardSnapshotDoc | null> {
  try {
    const collection = getBoardSnapshotsCollection();
    if (collection) {
      const doc = await collection.findOne({ roomId, id: snapshotId });
      if (doc) {
        const { _id, ...rest } = doc as any;
        return rest as BoardSnapshotDoc;
      }
    }
  } catch (err: any) {
    console.warn(`[BoardSnapshots] Fallback to memory for room ${roomId}:`, err?.message || err);
  }

  return (memorySnapshots.get(roomId) || []).find((snapshot) => snapshot.id === snapshotId) || null;
}

/** Clear cached snapshots (and their automatic capture window) for tests/local use. */
export function clearMemorySnapshots(roomId?: string): void {
  if (roomId) {
    memorySnapshots.delete(roomId);
    captureState.delete(roomId);
  } else {
    memorySnapshots.clear();
    captureState.clear();
  }
}

export function isRoomRestoring(roomId: string): boolean {
  return restoringRooms.has(roomId);
}

export function beginRestore(roomId: string): void {
  restoringRooms.add(roomId);
}

export function endRestore(roomId: string): void {
  restoringRooms.delete(roomId);
}

/**
 * Called once per durable board event (never for live stroke packets or the
 * restore event itself). Captures on the first threshold reached: 25 events or
 * 30 seconds since the previous snapshot. `now` is injectable for tests.
 */
export async function maybeCaptureSnapshot(
  roomId: string,
  elements: Record<string, any>,
  actor?: BoardActor,
  now = Date.now()
): Promise<void> {
  if (isRoomRestoring(roomId)) return;

  const state = getCaptureState(roomId, now);
  state.eventCount += 1;
  if (
    state.eventCount < SNAPSHOT_EVENT_THRESHOLD &&
    now - state.lastCapturedAt < SNAPSHOT_TIME_THRESHOLD_MS
  ) {
    return;
  }

  await recordBoardSnapshot(roomId, elements, actor, state.eventCount, now);
}
