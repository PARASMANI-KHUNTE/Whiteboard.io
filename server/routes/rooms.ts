import express from "express";
import type { Server as SocketIOServer } from "socket.io";
import {
  getUserByToken,
  saveRoomMeta,
  getRoomMeta,
  getRoomsForUser,
  generateRoomCode,
  deleteRoom,
} from "../auth";
import { extractAuthToken } from "../oauthState";
import { RoomCapacityError } from "../roomLifecycle";
import {
  rooms,
  roomCreations,
  roomLifecycle,
  getOrCreateRoom,
  canEvictCachedRoom,
  completeRoomDeletion,
  MAX_LIVE_ROOMS,
  ROOM_CAPACITY_ERROR,
} from "../roomStore";
import { getBoardEvents } from "../boardChangeLog";
import { getBoardSnapshot, listBoardSnapshots } from "../boardSnapshots";
import { getDiagramRevision, listDiagramRevisions } from "../aiRevisionHistory";
import {
  MAX_UPLOAD_BYTES,
  addRoomRecording,
  canManageRecordings,
  createRecordingId,
  getRoomRecording,
  isValidRecordingId,
  listRoomRecordings,
  readRecordingFile,
  saveRecordingFile,
  verifySignedDownloadToken,
  withDownloadUrl,
  type VoiceRecordingMeta,
} from "../voiceRecordings";
import { readFiniteNumber, readString } from "../socketPayload";

const SAFE_SNAPSHOT_ID = /^[A-Za-z0-9_-]{2,128}$/;

export interface RoomsRoutesOptions {
  io: SocketIOServer;
  authRateLimiter: (limit: number, windowMs: number, keyPrefix: string) => express.RequestHandler;
}

export function setupRoomsRoutes(app: express.Express, options: RoomsRoutesOptions): void {
  const { io, authRateLimiter } = options;

  // Session Room Creation & Management Routes
  app.post("/api/rooms/create", authRateLimiter(10, 60_000, "rooms-create"), async (req, res) => {
    try {
      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;

      if (!user) {
        res.status(401).json({ success: false, error: "You must be signed in to create a room" });
        return;
      }

      const { name, customCode, isLocked } = req.body;
      let roomId = customCode ? customCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-") : generateRoomCode();
      if (!roomId || roomId.length < 2) roomId = generateRoomCode();

      // Reject before the metadata write when the live cache is full (#74).
      if (!roomLifecycle.ensureCapacity(roomId, MAX_LIVE_ROOMS, roomCreations.size, Date.now(), canEvictCachedRoom)) {
        res.status(503).json({ success: false, error: ROOM_CAPACITY_ERROR });
        return;
      }

      // Ownership always comes from the server-issued session. Guest accounts
      // use the same endpoint after obtaining a server-issued guest token.
      const creatorId = user.id;
      const creatorName = user.name;

      const roomMeta = {
        id: roomId,
        name: (typeof name === "string" && name.trim().slice(0, 80)) || `Session ${roomId}`,
        creatorId,
        creatorName,
        createdAt: Date.now(),
        isLocked: !!isLocked,
        kickedUserIds: [],
        userPermissions: {},
      };

      await saveRoomMeta(roomMeta);

      const room = await getOrCreateRoom(roomId);
      room.name = roomMeta.name;
      room.creatorId = creatorId;
      room.creatorName = creatorName;
      room.isLocked = !!isLocked;

      res.json({ success: true, room: roomMeta });
    } catch (err: any) {
      if (err instanceof RoomCapacityError) {
        res.status(503).json({ success: false, error: ROOM_CAPACITY_ERROR });
        return;
      }
      res.status(400).json({ success: false, error: err.message || "Could not create session room" });
    }
  });

  app.get("/api/rooms/my-rooms", async (req, res) => {
    try {
      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;
      if (!user) {
        res.json({ success: true, rooms: [] });
        return;
      }
      const userRooms = await getRoomsForUser(user.id);
      res.json({ success: true, rooms: userRooms });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not load rooms" });
    }
  });

  // Room status check
  app.get("/api/room/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = rooms.get(roomId);
      const meta = await getRoomMeta(roomId);
      if (!room && !meta) {
        res.json({ exists: false, userCount: 0 });
        return;
      }
      res.json({
        exists: true,
        room: {
          id: roomId,
          name: room?.name || meta?.name || `Room ${roomId}`,
          creatorId: room?.creatorId || meta?.creatorId,
          creatorName: room?.creatorName || meta?.creatorName,
          isLocked: room?.isLocked ?? meta?.isLocked ?? false,
          userCount: room ? Object.keys(room.users).length : 0,
          elementCount: room ? Object.keys(room.elements).length : 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve room details" });
    }
  });

  // Durable board events timeline endpoint (#225)
  app.get("/api/rooms/:roomId/events", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
      const events = await getBoardEvents(roomId, { limit, before });
      res.json({ success: true, events });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve board events" });
    }
  });

  // Board snapshot history endpoints (#227). Metadata only in the list view so
  // clients can show a version timeline without downloading every element map.
  app.get("/api/rooms/:roomId/snapshots", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      if (!SAFE_SNAPSHOT_ID.test(roomId)) {
        res.status(400).json({ success: false, error: "Invalid room id" });
        return;
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const snapshots = await listBoardSnapshots(roomId, limit);
      res.json({
        success: true,
        snapshots: snapshots.map(({ id, roomId, actor, eventCount, timestamp, createdAt, elements }) => ({
          id,
          roomId,
          actor,
          eventCount,
          timestamp,
          createdAt,
          elementCount: Object.keys(elements || {}).length,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve board snapshots" });
    }
  });

  app.get("/api/rooms/:roomId/snapshots/:snapshotId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const snapshotId = req.params.snapshotId;
      if (!SAFE_SNAPSHOT_ID.test(roomId) || !SAFE_SNAPSHOT_ID.test(snapshotId)) {
        res.status(400).json({ success: false, error: "Invalid snapshot id" });
        return;
      }
      const snapshot = await getBoardSnapshot(roomId, snapshotId);
      if (!snapshot) {
        res.status(404).json({ success: false, error: "Version not found." });
        return;
      }
      res.json({ success: true, snapshot });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve board snapshot" });
    }
  });

  // AI diagram revision history (#241). Metadata only in the list view, with
  // the full AI element group available from the detail endpoint.
  app.get("/api/rooms/:roomId/ai-revisions", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      if (!SAFE_SNAPSHOT_ID.test(roomId)) {
        res.status(400).json({ success: false, error: "Invalid room id" });
        return;
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const revisions = await listDiagramRevisions(roomId, limit);
      res.json({
        success: true,
        revisions: revisions.map(({ id, roomId, sessionId, prompt, title, author, timestamp, elements }) => ({
          id,
          roomId,
          sessionId,
          prompt,
          title,
          author,
          timestamp,
          elementCount: elements.length,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve AI revisions" });
    }
  });

  app.get("/api/rooms/:roomId/ai-revisions/:revisionId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const revisionId = req.params.revisionId;
      if (!SAFE_SNAPSHOT_ID.test(roomId) || !SAFE_SNAPSHOT_ID.test(revisionId)) {
        res.status(400).json({ success: false, error: "Invalid revision id" });
        return;
      }
      const revision = await getDiagramRevision(roomId, revisionId);
      if (!revision) {
        res.status(404).json({ success: false, error: "AI revision not found." });
        return;
      }
      res.json({ success: true, revision });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve AI revision" });
    }
  });

  // Voice recordings (#239). Uploads are raw audio bodies so the global JSON
  // parser leaves them untouched; metadata travels in bounded request headers.
  app.post(
    "/api/rooms/:roomId/recordings",
    authRateLimiter(10, 60_000, "rooms-recordings-upload"),
    express.raw({ type: ["audio/*", "application/octet-stream"], limit: `${MAX_UPLOAD_BYTES}b` }),
    async (req, res) => {
      try {
        const roomId = req.params.roomId;
        if (!isValidRecordingId(roomId)) {
          res.status(400).json({ success: false, error: "Invalid room id" });
          return;
        }

        const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
        const user = token ? await getUserByToken(token) : null;
        if (!user) {
          res.status(401).json({ success: false, error: "You must be signed in to save a recording" });
          return;
        }

        const roomMeta = await getRoomMeta(roomId);
        if (!roomMeta) {
          res.status(404).json({ success: false, error: "Room not found" });
          return;
        }
        if (!canManageRecordings(roomMeta, user.id)) {
          res.status(403).json({ success: false, error: "Only the host can save a room recording" });
          return;
        }

        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (bytes.length === 0) {
          res.status(400).json({ success: false, error: "Recording audio is empty" });
          return;
        }
        if (bytes.length > MAX_UPLOAD_BYTES) {
          res.status(413).json({ success: false, error: "Recording is too large" });
          return;
        }

        const rawMime = (req.header("content-type") || "audio/webm").split(";")[0].trim().toLowerCase();
        const mimeType = ["audio/webm", "audio/ogg", "audio/mp4", "application/octet-stream"].includes(rawMime)
          ? rawMime
          : "audio/webm";
        const durationMs = readFiniteNumber(req.header("x-recording-duration"));
        const startedAt = readFiniteNumber(req.header("x-recording-started-at"));
        if (durationMs === null || durationMs < 0 || durationMs > 2 * 60 * 60 * 1000) {
          res.status(400).json({ success: false, error: "Invalid recording duration" });
          return;
        }
        if (startedAt === null || startedAt < Date.now() - 24 * 60 * 60 * 1000 || startedAt > Date.now() + 5 * 60 * 1000) {
          res.status(400).json({ success: false, error: "Invalid recording timestamp" });
          return;
        }

        const snapshotHeader = readString(req.header("x-recording-snapshot-id"), 128);
        const snapshotId = isValidRecordingId(snapshotHeader) ? snapshotHeader : undefined;
        const id = createRecordingId();
        await saveRecordingFile(roomId, id, bytes);

        const meta: VoiceRecordingMeta = {
          id,
          roomId,
          actor: {
            id: user.id,
            name: readString(user.name, 80) || "Unknown",
            color: readString(user.color, 32) || "#64748b",
          },
          startedAt: Math.round(startedAt),
          durationMs: Math.round(durationMs),
          sizeBytes: bytes.length,
          mimeType,
          snapshotId,
          createdAt: Date.now(),
          storageKey: `${roomId}/${id}.webm`,
        };

        const saved = await addRoomRecording(meta);
        io.to(roomId).emit("voice-recording-saved", {
          recordingId: id,
          durationMs: meta.durationMs,
          startedAt: meta.startedAt,
        });
        res.json({
          success: true,
          recording: withDownloadUrl(saved.find((item) => item.id === id) || meta),
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message || "Could not save recording" });
      }
    }
  );

  app.get("/api/rooms/:roomId/recordings", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      if (!isValidRecordingId(roomId)) {
        res.status(400).json({ success: false, error: "Invalid room id" });
        return;
      }
      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;
      if (!user) {
        res.status(401).json({ success: false, error: "You must be signed in to view recordings" });
        return;
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const recordings = await listRoomRecordings(roomId, limit);
      const now = Date.now();
      res.json({ success: true, recordings: recordings.map((meta) => withDownloadUrl(meta, now)) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not retrieve recordings" });
    }
  });

  // Pre-signed download: the token authorizes this exact recording for a short
  // window, so <audio src> works without putting a bearer token in the URL.
  app.get("/api/rooms/:roomId/recordings/:recordingId/download", async (req, res) => {
    try {
      const { roomId, recordingId } = req.params;
      if (!isValidRecordingId(roomId) || !isValidRecordingId(recordingId)) {
        res.status(400).json({ success: false, error: "Invalid recording id" });
        return;
      }
      if (!verifySignedDownloadToken(roomId, recordingId, req.query.expires, req.query.token)) {
        res.status(403).json({ success: false, error: "Download link is invalid or has expired" });
        return;
      }
      const recording = await getRoomRecording(roomId, recordingId);
      if (!recording) {
        res.status(404).json({ success: false, error: "Recording not found" });
        return;
      }
      const bytes = await readRecordingFile(roomId, recordingId);
      if (!bytes) {
        res.status(404).json({ success: false, error: "Recording audio is no longer available" });
        return;
      }
      res.setHeader("Content-Type", recording.mimeType || "audio/webm");
      res.setHeader("Content-Disposition", `inline; filename="${recordingId}.webm"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(bytes);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Could not download recording" });
    }
  });

  // Delete Room endpoint
  app.delete("/api/rooms/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;

      if (!user) {
        res.status(401).json({ success: false, error: "You must be signed in to delete a room" });
        return;
      }

      const roomData = rooms.get(roomId);
      const meta = await getRoomMeta(roomId);
      const creatorId = roomData?.creatorId || meta?.creatorId;
      // Ownership is proved by the server-issued session identity only. A
      // client-supplied creator id is public in room presence and must never
      // be accepted as proof.
      const requesterId = user.id;

      // Unknown ownership is never treated as permission to delete.
      if (!creatorId || creatorId !== requesterId) {
        res.status(403).json({ success: false, error: "Only the room creator can delete this room" });
        return;
      }

      const success = await deleteRoom(roomId, requesterId, creatorId);
      if (!success) {
        res.status(403).json({ success: false, error: "Only the room creator can delete this room" });
        return;
      }

      // Detach sockets and release the save guard only after cleanup finishes.
      await completeRoomDeletion(io, roomId, requesterId);

      res.json({ success: true, roomId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to delete room" });
    }
  });
}
