import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getRoomsCollection, isDbConnected } from "./db";

export interface VoiceRecordingActor {
  id: string;
  name: string;
  color: string;
}

export interface VoiceRecordingMeta {
  id: string;
  roomId: string;
  actor: VoiceRecordingActor;
  startedAt: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  /** Snapshot that best represents the board when the recording started. */
  snapshotId?: string;
  createdAt: number;
  /** Relative storage key; never an absolute filesystem path. */
  storageKey: string;
}

export interface VoiceRecordingWithUrl extends VoiceRecordingMeta {
  downloadUrl: string;
}

export interface VoiceRecordingState {
  isRecording: boolean;
  userId?: string;
  userName?: string;
  startedAt?: number;
}

export const MAX_RECORDINGS_PER_ROOM = 20;
export const RECORDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const SAFE_ID = /^[A-Za-z0-9_-]{2,128}$/;
const memoryRecordings = new Map<string, VoiceRecordingMeta[]>();
const activeRecordings = new Map<string, VoiceRecordingState>();

export function isValidRecordingId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function clampRecordingLimit(value: unknown, fallback = 20): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_RECORDINGS_PER_ROOM, Math.floor(parsed)));
}

export function createRecordingId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
}

function signingSecret(): string {
  return process.env.VOICE_RECORDING_SIGNING_SECRET || "whiteboard-local-recording-secret";
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

export function createSignedDownloadUrl(
  roomId: string,
  recordingId: string,
  now = Date.now(),
  ttlMs = SIGNED_URL_TTL_MS
): string {
  const expires = now + ttlMs;
  const token = hmac(`${roomId}.${recordingId}.${expires}`);
  return `/api/rooms/${encodeURIComponent(roomId)}/recordings/${encodeURIComponent(recordingId)}/download?expires=${expires}&token=${token}`;
}

export function verifySignedDownloadToken(
  roomId: string,
  recordingId: string,
  expiresRaw: unknown,
  token: unknown,
  now = Date.now()
): boolean {
  const expires = typeof expiresRaw === "number" ? expiresRaw : Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= now) return false;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = hmac(`${roomId}.${recordingId}.${expires}`);
  const actual = Buffer.from(token.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function withDownloadUrl(meta: VoiceRecordingMeta, now = Date.now()): VoiceRecordingWithUrl {
  return {
    ...meta,
    downloadUrl: createSignedDownloadUrl(meta.roomId, meta.id, now),
  };
}

/** Host and explicitly assigned admins can control recording for the room. */
export function canManageRecordings(
  room: { creatorId: string; userPermissions?: Record<string, { role?: string }> },
  userId: string
): boolean {
  if (!userId) return false;
  if (room.creatorId === userId) return true;
  return room.userPermissions?.[userId]?.role === "admin";
}

export function beginRoomRecording(
  roomId: string,
  actor: { id: string; name: string },
  startedAt = Date.now()
): VoiceRecordingState {
  const state: VoiceRecordingState = {
    isRecording: true,
    userId: actor.id,
    userName: actor.name,
    startedAt,
  };
  activeRecordings.set(roomId, state);
  return state;
}

export function endRoomRecording(roomId: string): VoiceRecordingState {
  const state: VoiceRecordingState = { isRecording: false };
  activeRecordings.delete(roomId);
  return state;
}

export function getRoomRecordingState(roomId: string): VoiceRecordingState | null {
  return activeRecordings.get(roomId) || null;
}

function sanitizeStoredRecording(value: any): VoiceRecordingMeta | null {
  if (!value || typeof value !== "object") return null;
  if (!isValidRecordingId(value.id) || !isValidRecordingId(value.roomId)) return null;
  const createdAt = Number(value.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const actor = value.actor;
  if (!actor || typeof actor !== "object") return null;
  return {
    id: value.id,
    roomId: value.roomId,
    actor: {
      id: String(actor.id || "").slice(0, 128),
      name: String(actor.name || "Unknown").slice(0, 80),
      color: String(actor.color || "#64748b").slice(0, 32),
    },
    startedAt: Number(value.startedAt) || createdAt,
    durationMs: Math.max(0, Number(value.durationMs) || 0),
    sizeBytes: Math.max(0, Number(value.sizeBytes) || 0),
    mimeType: typeof value.mimeType === "string" ? value.mimeType.slice(0, 80) : "audio/webm",
    snapshotId: isValidRecordingId(value.snapshotId) ? value.snapshotId : undefined,
    createdAt,
    storageKey: isValidRecordingId(value.storageKey)
      ? value.storageKey
      : `${value.roomId}/${value.id}.webm`,
  };
}

function getRecordingRoot(): string {
  if (process.env.VOICE_RECORDING_DIR) return path.resolve(process.env.VOICE_RECORDING_DIR);
  return path.resolve(process.cwd(), "server", "data", "recordings");
}

function recordingPath(roomId: string, recordingId: string): string {
  if (!isValidRecordingId(roomId) || !isValidRecordingId(recordingId)) {
    throw new Error("Invalid recording identifiers");
  }
  return path.join(getRecordingRoot(), roomId, `${recordingId}.webm`);
}

export async function saveRecordingFile(roomId: string, recordingId: string, bytes: Buffer): Promise<void> {
  const filePath = recordingPath(roomId, recordingId);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, bytes);
}

export async function readRecordingFile(roomId: string, recordingId: string): Promise<Buffer | null> {
  try {
    return await fs.promises.readFile(recordingPath(roomId, recordingId));
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function removeRecordingFile(meta: VoiceRecordingMeta): Promise<void> {
  try {
    await fs.promises.unlink(recordingPath(meta.roomId, meta.id));
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.warn("[Recordings] Failed to prune file:", err?.message || err);
  }
}

function mergeRecordings(stored: VoiceRecordingMeta[], cached: VoiceRecordingMeta[]): VoiceRecordingMeta[] {
  const byId = new Map<string, VoiceRecordingMeta>();
  for (const item of [...stored, ...cached]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addRoomRecording(meta: VoiceRecordingMeta): Promise<VoiceRecordingMeta[]> {
  const list = mergeRecordings([meta], memoryRecordings.get(meta.roomId) || []).slice(
    0,
    MAX_RECORDINGS_PER_ROOM
  );
  memoryRecordings.set(meta.roomId, list);

  if (isDbConnected()) {
    try {
      const collection = getRoomsCollection();
      await collection.updateOne(
        { id: meta.roomId },
        {
          $push: {
            recordings: {
              $each: [meta],
              $sort: { createdAt: -1 },
              $slice: MAX_RECORDINGS_PER_ROOM,
            },
          },
        }
      );
    } catch (err: any) {
      console.warn("[Recordings] Could not persist recording metadata:", err?.message || err);
    }
  }

  return list;
}

export async function listRoomRecordings(roomId: string, limit = 20, now = Date.now()): Promise<VoiceRecordingMeta[]> {
  if (!isValidRecordingId(roomId)) return [];

  let stored: VoiceRecordingMeta[] = [];
  if (isDbConnected()) {
    try {
      const doc = await getRoomsCollection().findOne({ id: roomId }, { projection: { recordings: 1 } });
      if (Array.isArray(doc?.recordings)) {
        stored = doc.recordings
          .map(sanitizeStoredRecording)
          .filter((item): item is VoiceRecordingMeta => !!item && item.roomId === roomId)
          .slice(0, MAX_RECORDINGS_PER_ROOM);
      }
    } catch (err: any) {
      console.warn("[Recordings] Could not read recording metadata:", err?.message || err);
    }
  }

  const merged = mergeRecordings(stored, memoryRecordings.get(roomId) || []);
  const active = merged.filter((item) => now - item.createdAt <= RECORDING_RETENTION_MS);
  const expired = merged.filter((item) => now - item.createdAt > RECORDING_RETENTION_MS);
  if (expired.length > 0) {
    void Promise.allSettled(expired.map(removeRecordingFile));
  }

  memoryRecordings.set(roomId, active.slice(0, MAX_RECORDINGS_PER_ROOM));
  return active.slice(0, clampRecordingLimit(limit));
}

export async function getRoomRecording(roomId: string, recordingId: string): Promise<VoiceRecordingMeta | null> {
  if (!isValidRecordingId(roomId) || !isValidRecordingId(recordingId)) return null;
  const list = await listRoomRecordings(roomId, MAX_RECORDINGS_PER_ROOM);
  return list.find((item) => item.id === recordingId) || null;
}

export function clearMemoryRecordings(roomId?: string): void {
  if (roomId) {
    memoryRecordings.delete(roomId);
    activeRecordings.delete(roomId);
    return;
  }
  memoryRecordings.clear();
  activeRecordings.clear();
}
