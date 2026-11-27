import crypto from 'crypto';
import { getRoomsCollection, isDbConnected } from './db';
import type { DiagramRevision } from './roomTypes';
import { readId, readString, sanitizeElementBatch } from './socketPayload';

/** Maximum AI revisions retained per room, oldest first in the stored array. */
export const MAX_AI_REVISIONS_PER_ROOM = 20;

const memoryRevisions = new Map<string, DiagramRevision[]>();

function sanitizeRevision(value: unknown, roomId: string): DiagramRevision | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = readId(raw.id, 128);
  const sessionId = readId(raw.sessionId, 128);
  if (!id || !sessionId) return null;

  const timestamp = Number(raw.timestamp);
  const author = raw.author && typeof raw.author === 'object' ? (raw.author as Record<string, unknown>) : null;
  const prefix = `ai_${sessionId}_`;
  const elements = sanitizeElementBatch(raw.elements).filter(
    (element) => element.id.startsWith(prefix)
  );

  return {
    id,
    roomId,
    sessionId,
    prompt: readString(raw.prompt, 1200) || 'AI diagram',
    title: readString(raw.title, 160) || undefined,
    author: author
      ? {
          id: readId(author.id, 128) || '',
          name: readString(author.name, 80) || 'Unknown',
          color: readString(author.color, 32) || '#6b7280',
        }
      : undefined,
    elements,
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    createdAt: new Date(
      Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
    ).toISOString(),
  };
}

function capRevisions(revisions: DiagramRevision[]): DiagramRevision[] {
  return revisions.length > MAX_AI_REVISIONS_PER_ROOM
    ? revisions.slice(revisions.length - MAX_AI_REVISIONS_PER_ROOM)
    : revisions;
}

function readStoredRevisions(roomId: string, doc: unknown): DiagramRevision[] {
  const raw = doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};
  const history = Array.isArray(raw.diagramHistory) ? raw.diagramHistory : [];
  return history
    .map((entry) => sanitizeRevision(entry, roomId))
    .filter((entry): entry is DiagramRevision => Boolean(entry));
}

/**
 * Record one AI turn for a room. Stored in memory first so the history remains
 * available when MongoDB is unavailable, then mirrored into `rooms.diagramHistory`.
 */
export async function recordDiagramRevision(
  roomId: string,
  input: {
    sessionId: string;
    prompt: string;
    title?: string;
    author?: { id: string; name: string; color: string };
    elements: unknown;
    now?: number;
  }
): Promise<DiagramRevision | null> {
  const cleanRoomId = readId(roomId, 128);
  if (!cleanRoomId) return null;

  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const revision = sanitizeRevision(
    {
      id: crypto.randomUUID(),
      roomId: cleanRoomId,
      sessionId: input.sessionId,
      prompt: input.prompt,
      title: input.title,
      author: input.author,
      elements: input.elements,
      timestamp: now,
      createdAt: new Date(now).toISOString(),
    },
    cleanRoomId
  );
  if (!revision || revision.elements.length === 0) return null;

  const current = capRevisions([...(memoryRevisions.get(cleanRoomId) || []), revision]);
  memoryRevisions.set(cleanRoomId, current);

  if (isDbConnected()) {
    try {
      const rooms = getRoomsCollection();
      const existing = await rooms.findOne(
        { id: cleanRoomId },
        { projection: { diagramHistory: 1 } }
      );
      if (existing) {
        const stored = capRevisions([...readStoredRevisions(cleanRoomId, existing), revision]);
        await rooms.updateOne({ id: cleanRoomId }, { $set: { diagramHistory: stored } });
      }
    } catch (err) {
      console.warn(`[AiRevisionHistory] Could not persist revision for room ${cleanRoomId}:`, err);
    }
  }

  return revision;
}

/** Revisions for a room, newest first. Memory and Mongo entries are merged by id. */
export async function listDiagramRevisions(roomId: string, limit = MAX_AI_REVISIONS_PER_ROOM): Promise<DiagramRevision[]> {
  const cleanRoomId = readId(roomId, 128);
  if (!cleanRoomId) return [];
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 20), 100));
  const merged = new Map<string, DiagramRevision>();

  if (isDbConnected()) {
    try {
      const doc = await getRoomsCollection().findOne(
        { id: cleanRoomId },
        { projection: { diagramHistory: 1 } }
      );
      readStoredRevisions(cleanRoomId, doc).forEach((revision) => merged.set(revision.id, revision));
    } catch (err) {
      console.warn(`[AiRevisionHistory] Falling back to memory for room ${cleanRoomId}:`, err);
    }
  }

  (memoryRevisions.get(cleanRoomId) || []).forEach((revision) => merged.set(revision.id, revision));
  return Array.from(merged.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, safeLimit);
}

/** Fetch one revision, always scoped to its room. */
export async function getDiagramRevision(roomId: string, revisionId: string): Promise<DiagramRevision | null> {
  const cleanRoomId = readId(roomId, 128);
  const cleanRevisionId = readId(revisionId, 128);
  if (!cleanRoomId || !cleanRevisionId) return null;

  const memory = memoryRevisions.get(cleanRoomId) || [];
  const fromMemory = memory.find((revision) => revision.id === cleanRevisionId);
  if (fromMemory) return fromMemory;

  if (isDbConnected()) {
    try {
      const doc = await getRoomsCollection().findOne(
        { id: cleanRoomId },
        { projection: { diagramHistory: 1 } }
      );
      return readStoredRevisions(cleanRoomId, doc).find((revision) => revision.id === cleanRevisionId) || null;
    } catch (err) {
      console.warn(`[AiRevisionHistory] Could not read revision for room ${cleanRoomId}:`, err);
    }
  }

  return null;
}

/** Clear cached revisions (tests and room deletion callers). */
export function clearMemoryDiagramRevisions(roomId?: string): void {
  if (roomId) {
    memoryRevisions.delete(roomId);
  } else {
    memoryRevisions.clear();
  }
}
