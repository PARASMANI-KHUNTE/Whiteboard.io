import type { Server as SocketIOServer } from "socket.io";
import {
  getRoomMeta,
  loadRoomElements,
  saveRoomAccessState,
  transferRoomOwnership,
  finalizeRoomDeletion,
  hasPendingElementSave,
} from "./auth";
import { RoomCapacityError, RoomLifecycleManager } from "./roomLifecycle";
import { getOrCreateCached } from "./roomCreation";
import { chooseReplacementHost } from "./roomHost";
import { pruneVoteEligibility } from "./voteEligibility";
import type { RoomData } from "./roomTypes";

export function positiveEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const rooms = new Map<string, RoomData>();
export const roomCreations = new Map<string, Promise<RoomData>>();
export const roomLifecycle = new RoomLifecycleManager(rooms);

export const MAX_LIVE_ROOMS = positiveEnvInt("MAX_LIVE_ROOMS", 500);
export const ROOM_CAPACITY_ERROR = "The server is at room capacity. Please try again shortly.";

/** Never reclaim a room whose element changes are still waiting to be saved. */
export function canEvictCachedRoom(roomId: string): boolean {
  return !hasPendingElementSave(roomId);
}

export async function buildRoom(roomId: string): Promise<RoomData> {
  const meta = await getRoomMeta(roomId);
  // Another join may have populated the cache while the metadata read ran.
  const cachedAfterMeta = rooms.get(roomId);
  if (cachedAfterMeta) return cachedAfterMeta;

  const persistedElements = await loadRoomElements(roomId);
  const cachedAfterElements = rooms.get(roomId);
  if (cachedAfterElements) return cachedAfterElements;

  return {
    id: roomId,
    name: meta?.name || `Room ${roomId}`,
    creatorId: meta?.creatorId || '',
    creatorName: meta?.creatorName || '',
    createdAt: meta?.createdAt || Date.now(),
    isLocked: meta?.isLocked || false,
    kickedUserIds: new Set<string>(meta?.kickedUserIds || []),
    userPermissions: meta?.userPermissions || {},
    elements: persistedElements || {},
    users: {},
    voteToClear: null,
    voteTimer: null,
  };
}

/**
 * All callers share one in-flight creation, so no RoomData is orphaned (#71).
 * Admission happens before the two MongoDB reads, so a full cache cannot be
 * turned into an unbounded query flood by joining random codes (#74).
 */
export async function getOrCreateRoom(roomId: string): Promise<RoomData> {
  if (!roomLifecycle.ensureCapacity(roomId, MAX_LIVE_ROOMS, roomCreations.size, Date.now(), canEvictCachedRoom)) {
    throw new RoomCapacityError();
  }
  const room = await getOrCreateCached(roomId, rooms, roomCreations, () => buildRoom(roomId));
  roomLifecycle.touch(roomId);
  return room;
}

/** Fire-and-forget persistence of a room's moderation state. */
export function persistRoomAccess(room: RoomData) {
  void saveRoomAccessState(
    {
      id: room.id,
      name: room.name,
      creatorId: room.creatorId,
      creatorName: room.creatorName,
      createdAt: room.createdAt,
      isLocked: room.isLocked,
    },
    {
      isLocked: room.isLocked,
      kickedUserIds: Array.from(room.kickedUserIds),
      userPermissions: room.userPermissions,
    }
  );
}

/** Promote the next participant when a host leaves a room by any path. */
export function migrateRoomHost(io: SocketIOServer, room: RoomData, departingUserId: string): boolean {
  const nextHost = chooseReplacementHost(room.users, departingUserId, room.creatorId);
  if (!nextHost) return false;

  nextHost.isHost = true;
  nextHost.role = 'admin';
  nextHost.canWrite = true;
  room.creatorId = nextHost.id;
  room.creatorName = nextHost.name;
  room.userPermissions[nextHost.id] = { canWrite: true, role: 'admin' };

  void transferRoomOwnership(room.id, nextHost.id, nextHost.name);
  persistRoomAccess(room);

  io.to(room.id).emit("room-host-migrated", {
    newHostId: nextHost.id,
    newHostName: nextHost.name,
    message: `${nextHost.name} is now the host of this room.`,
  });
  io.to(room.id).emit("user-permission-changed", {
    userId: nextHost.id,
    canWrite: true,
    role: 'admin',
  });

  const socketIds = nextHost.socketIds?.length
    ? nextHost.socketIds
    : nextHost.socketId
      ? [nextHost.socketId]
      : [];
  for (const socketId of socketIds) {
    io.to(socketId).emit("permission-updated", {
      canWrite: true,
      role: 'admin',
      message: "You have been promoted to Host/Admin of this room.",
    });
  }

  return true;
}

/** Re-broadcast a vote after presence or permissions change (#69). */
export function syncVoteEligibility(io: SocketIOServer, room: RoomData): void {
  const vote = room.voteToClear;
  if (!vote?.active) return;
  pruneVoteEligibility(vote, room);
  io.to(room.id).emit("vote-clear-updated", vote);
}

/**
 * Finish a successful deletion only after every socket has left. The element
 * save guard stays active until this point so late emits cannot recreate the
 * room in MongoDB (#72).
 */
export async function completeRoomDeletion(io: SocketIOServer, roomId: string, deletedBy: string) {
  io.to(roomId).emit("room-deleted", {
    roomId,
    deletedBy,
    message: "This room has been permanently deleted by the host.",
  });

  const socketIds = io.sockets.adapter.rooms.get(roomId);
  if (socketIds) {
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      const clear = socket?.data.clearRoomState;
      if (typeof clear === "function") clear();
    }
  }

  await io.in(roomId).socketsLeave(roomId);
  roomLifecycle.forget(roomId);
  finalizeRoomDeletion(roomId);
}
