import crypto from "crypto";
import { getBoardEventsCollection, type BoardEventDoc } from "./db";

export interface BoardActor {
  id: string;
  name: string;
  color: string;
}

export type BoardEventType =
  | 'create'
  | 'update'
  | 'delete'
  | 'batch-create'
  | 'batch-delete'
  | 'clear';

export interface BoardEventInput {
  roomId: string;
  type: BoardEventType;
  actor: BoardActor;
  elementId?: string;
  elementIds?: string[];
  elementType?: string;
  details?: Record<string, any>;
  timestamp?: number;
}

const MAX_IN_MEMORY_EVENTS_PER_ROOM = 1000;
const COALESCE_WINDOW_MS = 2000;

// In-memory buffer per room for fast retrieval, local testing, and offline fallback
const memoryEventLog = new Map<string, BoardEventDoc[]>();

export function getMemoryEvents(roomId: string): BoardEventDoc[] {
  return memoryEventLog.get(roomId) || [];
}

export function clearMemoryEvents(roomId?: string): void {
  if (roomId) {
    memoryEventLog.delete(roomId);
  } else {
    memoryEventLog.clear();
  }
}

/**
 * Record a durable board action event.
 * Coalesces consecutive updates to the same element by the same actor within COALESCE_WINDOW_MS.
 */
export async function recordBoardEvent(input: BoardEventInput): Promise<BoardEventDoc> {
  const roomId = input.roomId;
  const now = input.timestamp || Date.now();

  const roomEvents = memoryEventLog.get(roomId) || [];
  if (!memoryEventLog.has(roomId)) {
    memoryEventLog.set(roomId, roomEvents);
  }

  // Coalesce rapid consecutive updates for the same element by the same actor
  if (input.type === 'update' && input.elementId && roomEvents.length > 0) {
    const lastEvent = roomEvents[roomEvents.length - 1];
    if (
      lastEvent &&
      lastEvent.type === 'update' &&
      lastEvent.elementId === input.elementId &&
      lastEvent.actor.id === input.actor.id &&
      now - lastEvent.timestamp <= COALESCE_WINDOW_MS
    ) {
      lastEvent.timestamp = now;
      lastEvent.createdAt = new Date(now);
      if (input.details) {
        lastEvent.details = { ...lastEvent.details, ...input.details };
      }

      // Update in MongoDB asynchronously if available
      try {
        const collection = getBoardEventsCollection();
        if (collection) {
          void collection.updateOne(
            { id: lastEvent.id },
            { $set: { timestamp: now, createdAt: lastEvent.createdAt, details: lastEvent.details } }
          );
        }
      } catch {}

      return lastEvent;
    }
  }

  const doc: BoardEventDoc = {
    id: crypto.randomUUID(),
    roomId,
    type: input.type,
    actor: {
      id: input.actor.id,
      name: (input.actor.name || "Unknown").slice(0, 80),
      color: input.actor.color || "#6b7280",
    },
    elementId: input.elementId,
    elementIds: input.elementIds ? input.elementIds.slice(0, 100) : undefined,
    elementType: input.elementType,
    details: input.details ? JSON.parse(JSON.stringify(input.details)) : undefined,
    timestamp: now,
    createdAt: new Date(now),
  };

  roomEvents.push(doc);
  if (roomEvents.length > MAX_IN_MEMORY_EVENTS_PER_ROOM) {
    roomEvents.splice(0, roomEvents.length - MAX_IN_MEMORY_EVENTS_PER_ROOM);
  }

  try {
    const collection = getBoardEventsCollection();
    if (collection) {
      await collection.insertOne(doc);
    }
  } catch (err: any) {
    // Non-fatal if DB is in memory mode or temporarily unreachable
    console.warn(`[BoardLog] Failed to persist event to MongoDB for room ${roomId}:`, err?.message || err);
  }

  return doc;
}

/**
 * Retrieve durable events for a room, newest first.
 */
export async function getBoardEvents(
  roomId: string,
  options?: { limit?: number; before?: number }
): Promise<BoardEventDoc[]> {
  const limit = Math.max(1, Math.min(Number(options?.limit) || 50, 200));
  const before = options?.before;

  try {
    const collection = getBoardEventsCollection();
    if (collection) {
      const query: any = { roomId };
      if (typeof before === "number" && Number.isFinite(before)) {
        query.timestamp = { $lt: before };
      }
      const docs = await collection
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      if (docs.length > 0) {
        return docs.map(({ _id, ...rest }: any) => rest as BoardEventDoc);
      }
    }
  } catch (err: any) {
    console.warn(`[BoardLog] Fallback to memory for room ${roomId}:`, err?.message || err);
  }

  // Fallback to in-memory log
  const memory = memoryEventLog.get(roomId) || [];
  let filtered = memory;
  if (typeof before === "number" && Number.isFinite(before)) {
    filtered = filtered.filter((ev) => ev.timestamp < before);
  }
  return [...filtered].reverse().slice(0, limit);
}

/**
 * Prune events exceeding the maximum retention per room.
 */
export async function pruneBoardEvents(roomId: string, maxEvents = MAX_IN_MEMORY_EVENTS_PER_ROOM): Promise<number> {
  let prunedCount = 0;
  const memory = memoryEventLog.get(roomId);
  if (memory && memory.length > maxEvents) {
    prunedCount += memory.length - maxEvents;
    memory.splice(0, memory.length - maxEvents);
  }

  try {
    const collection = getBoardEventsCollection();
    if (collection) {
      const total = await collection.countDocuments({ roomId });
      if (total > maxEvents) {
        const excess = total - maxEvents;
        const oldestDocs = await collection
          .find({ roomId })
          .sort({ timestamp: 1 })
          .limit(excess)
          .project({ id: 1 })
          .toArray();
        const idsToDelete = oldestDocs.map((d) => d.id);
        const res = await collection.deleteMany({ id: { $in: idsToDelete } });
        prunedCount += res.deletedCount;
      }
    }
  } catch (err: any) {
    console.warn(`[BoardLog] Pruning failed in DB for room ${roomId}:`, err?.message || err);
  }

  return prunedCount;
}
