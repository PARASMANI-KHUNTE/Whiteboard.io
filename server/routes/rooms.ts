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
