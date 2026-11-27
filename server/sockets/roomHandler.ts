import type { Socket, Server as SocketIOServer } from "socket.io";
import {
  getUserByToken,
  claimRoomCreator,
  transferRoomOwnership,
  getRoomMeta,
  deleteRoom,
} from "../auth";
import { readCookie, AUTH_COOKIE_NAME } from "../oauthState";
import { resolveSocketIdentity } from "../socketIdentity";
import {
  applyLockToStoredPermissions,
  effectivePermission,
  setExplicitPermission,
} from "../roomPermissions";
import { SlidingWindowRateLimiter } from "../joinRateLimiter";
import { RoomCapacityError } from "../roomLifecycle";
import {
  isRecord,
  readBoolean,
  readId,
  readString,
  MAX_ID_LENGTH,
  MAX_REASON_LENGTH,
} from "../socketPayload";
import {
  rooms,
  roomLifecycle,
  getOrCreateRoom,
  persistRoomAccess,
  migrateRoomHost,
  syncVoteEligibility,
  completeRoomDeletion,
  ROOM_CAPACITY_ERROR,
  positiveEnvInt,
} from "../roomStore";
import type { RoomData } from "../roomTypes";
import type { SocketHandlerParams } from "./types";
import { signalingLimiter } from "./voiceHandler";

export const JOIN_RATE_LIMIT = positiveEnvInt("JOIN_RATE_LIMIT", 20);
export const JOIN_IP_RATE_LIMIT = positiveEnvInt("JOIN_IP_RATE_LIMIT", 100);
export const JOIN_RATE_WINDOW_MS = positiveEnvInt("JOIN_RATE_WINDOW_MS", 60_000);
export const joinSocketLimiter = new SlidingWindowRateLimiter(JOIN_RATE_LIMIT, JOIN_RATE_WINDOW_MS);
export const joinIpLimiter = new SlidingWindowRateLimiter(JOIN_IP_RATE_LIMIT, JOIN_RATE_WINDOW_MS);
export const ROOM_JOIN_RATE_ERROR = "Too many room join attempts. Please wait a moment and try again.";

export function socketJoinAddress(socket: Socket): string {
  return socket.handshake.address || socket.request.socket.remoteAddress || "unknown_ip";
}

export function registerRoomHandlers({ io, socket, state }: SocketHandlerParams): void {
  const { safeOn, clearLiveStrokes } = state;

  // Join room
  safeOn("join-room", async (rawData: { roomId: string; user: { id: string; name: string; color: string; username?: string }; token?: string }) => {
    const data = rawData || ({} as any);
    const rawRoomId = typeof data.roomId === "string" ? data.roomId : "";
    const roomId = rawRoomId
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "-")
      .slice(0, 64);

    if (!roomId || roomId.length < 2) {
      socket.emit("room-error", { message: "Invalid room code." });
      return;
    }

    // Admission control runs before token/DB work so a flood of arbitrary
    // codes cannot turn into DB queries or rate-limit state of its own (#74).
    const addressLimit = joinIpLimiter.check(socketJoinAddress(socket));
    if (!addressLimit.allowed) {
      socket.emit("room-error", {
        message: ROOM_JOIN_RATE_ERROR,
        code: "ROOM_JOIN_RATE_LIMIT",
        retryAfterMs: addressLimit.retryAfterMs,
      });
      return;
    }
    const socketLimit = joinSocketLimiter.check(socket.id);
    if (!socketLimit.allowed) {
      socket.emit("room-error", {
        message: ROOM_JOIN_RATE_ERROR,
        code: "ROOM_JOIN_RATE_LIMIT",
        retryAfterMs: socketLimit.retryAfterMs,
      });
      return;
    }

    // Every participant must have a server-issued identity. The id broadcast
    // in room presence is public, so accepting a client-supplied id would let
    // any guest claim the host's moderation rights.
    const rawToken =
      typeof data.token === "string" && data.token
        ? data.token
        : readCookie(socket.handshake.headers.cookie, AUTH_COOKIE_NAME);
    const authenticatedUser = rawToken
      ? await getUserByToken(rawToken)
      : null;
    const identity = resolveSocketIdentity(authenticatedUser, data.user);
    if (!identity) {
      socket.emit("room-error", {
        message: "Your session is no longer valid. Refresh the page to rejoin.",
      });
      return;
    }
    const accountId = identity.id;
    const actualUserId = identity.id;
    const actualName = identity.name;
    const actualColor = identity.color;

    let room: RoomData;
    try {
      room = await getOrCreateRoom(roomId);
    } catch (err) {
      if (err instanceof RoomCapacityError) {
        socket.emit("room-error", { message: ROOM_CAPACITY_ERROR, code: "ROOM_CAPACITY" });
        return;
      }
      throw err;
    }

    // Verify if user was kicked by the host
    if (room.kickedUserIds.has(actualUserId)) {
      socket.emit("kicked", {
        reason: "You have been removed from this room by the host.",
      });
      return;
    }

    // Same socket changing identity (login/logout): hand host rights to the
    // new identity before dropping the old presence so the person who created
    // the room does not lose ownership simply because they signed in.
    const previousPermission =
      state.currentUser && state.currentUser.id !== actualUserId
        ? room.userPermissions[state.currentUser.id]
        : undefined;
    const previousIdentityWasHost = Boolean(
      state.currentUser &&
        state.currentUser.id !== actualUserId &&
        state.currentRoomId === roomId &&
        state.currentUser.isHost
    );
    if (previousIdentityWasHost) {
      room.creatorId = accountId || actualUserId;
      room.creatorName = actualName;
      void transferRoomOwnership(roomId, room.creatorId, room.creatorName);
    }

    if (state.currentUser && state.currentUser.id !== actualUserId && state.currentRoomId === roomId) {
      delete room.users[state.currentUser.id];
      socket.to(roomId).emit("user-left", { userId: state.currentUser.id });
      syncVoteEligibility(io, room);
    }

    // Leave the previously joined room when switching rooms. Host migration
    // must run here too; disconnect only fires when the socket closes.
    if (state.currentRoomId && state.currentRoomId !== roomId) {
      const previousRoom = rooms.get(state.currentRoomId);
      if (previousRoom && state.currentUser) {
        const wasPreviousRoomHost = Boolean(
          previousRoom.users[state.currentUser.id]?.isHost ?? state.currentUser.isHost
        );
        delete previousRoom.users[state.currentUser.id];
        socket.to(state.currentRoomId).emit("user-left", { userId: state.currentUser.id });
        if (wasPreviousRoomHost) {
          migrateRoomHost(io, previousRoom, state.currentUser.id);
        }
        syncVoteEligibility(io, previousRoom);
      }
      socket.leave(state.currentRoomId);
    }

    state.currentRoomId = roomId;
    roomLifecycle.cancelCleanup(roomId);
    socket.join(roomId);

    // Determine Host / Admin status
    const isRoomCreator = Boolean(
      room.creatorId && (
        (accountId && room.creatorId === accountId) ||
        room.creatorId === actualUserId
      )
    );
    const isFirstUser = !room.creatorId && Object.keys(room.users).length === 0;

    if (isFirstUser && !room.creatorId) {
      room.creatorId = accountId || actualUserId;
      room.creatorName = actualName;
      // Persist the claim so the room is not left ownerless after a restart
      // (and so invite-code rooms show up in the creator's saved rooms).
      void claimRoomCreator({
        id: room.id,
        name: room.name,
        creatorId: room.creatorId,
        creatorName: room.creatorName,
        createdAt: room.createdAt,
        isLocked: room.isLocked,
        kickedUserIds: Array.from(room.kickedUserIds),
        userPermissions: room.userPermissions,
      });
    }

    const isHost = isRoomCreator || isFirstUser;
    let canWrite = true;
    let role: 'admin' | 'editor' | 'viewer' = 'editor';
    if (isHost) {
      role = 'admin';
      canWrite = true;
    } else {
      const storedPerm =
        room.userPermissions[actualUserId] ||
        (accountId ? room.userPermissions[accountId] : undefined);
      const userPerm = storedPerm || previousPermission;
      if (userPerm) {
        // Explicit host decisions are evaluated against the current lock
        // state; a locked room still overrides a stored grant (#70).
        const resolved = effectivePermission(userPerm, room.isLocked);
        canWrite = resolved.canWrite;
        role = resolved.role;
        // Carry a restriction across an in-place login so signing in cannot
        // be used to shed a host-revoked view-only state. Keep the stored
        // decision itself so an unlock can restore an explicit grant later.
        if (!storedPerm) {
          room.userPermissions[actualUserId] = { ...userPerm };
          persistRoomAccess(room);
        }
      } else {
        const resolved = effectivePermission(undefined, room.isLocked);
        canWrite = resolved.canWrite;
        role = resolved.role;
        room.userPermissions[actualUserId] = { canWrite, role };
      }
    }

    const previousPresence = room.users[actualUserId];
    const previousSocketIds = previousPresence
      ? previousPresence.socketIds?.length
        ? previousPresence.socketIds
        : [previousPresence.socketId]
      : [];

    state.currentUser = {
      id: actualUserId,
      socketId: socket.id,
      socketIds: Array.from(new Set([...previousSocketIds.filter(Boolean), socket.id])),
      name: actualName,
      color: actualColor,
      roomId,
      isHost,
      role,
      canWrite,
      isSpeaking: false,
      audioLevel: 0,
    };

    room.users[actualUserId] = state.currentUser;

    // Send initial room state to connecting user
    socket.emit("room-init", {
      roomId,
      roomName: room.name,
      creatorId: room.creatorId,
      creatorName: room.creatorName,
      isLocked: room.isLocked,
      elements: room.elements,
      users: room.users,
      voteToClear: room.voteToClear,
      yourRole: state.currentUser.role,
      canWrite: state.currentUser.canWrite,
      isHost: state.currentUser.isHost,
    });

    // Broadcast user-joined to other users in room
    socket.to(roomId).emit("user-joined", state.currentUser);
  });

  // Admin: Set User Writing Permissions (Revoke / Grant)
  safeOn("admin-set-permission", (payload: { targetUserId: string; canWrite: boolean }) => {
    if (!state.currentRoomId || !state.currentUser || !state.currentUser.isHost) return;
    if (!isRecord(payload)) return;
    const targetUserId = readId(payload.targetUserId);
    const requestedCanWrite = readBoolean(payload.canWrite);
    if (!targetUserId || requestedCanWrite === null) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (targetUserId === state.currentUser.id) return; // Host cannot revoke self

    // Store the host's decision explicitly so lock/unlock cannot undo it.
    setExplicitPermission(room.userPermissions, targetUserId, requestedCanWrite);
    const { canWrite, role } = effectivePermission(
      room.userPermissions[targetUserId],
      room.isLocked
    );

    if (room.users[targetUserId]) {
      room.users[targetUserId].canWrite = canWrite;
      room.users[targetUserId].role = role;
    }
    syncVoteEligibility(io, room);

    // Notify the target user specifically
    const targetUser = room.users[targetUserId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit("permission-updated", {
        canWrite,
        role,
        message: requestedCanWrite
          ? canWrite
            ? "Writing permission has been granted by the host."
            : "Writing permission was granted by the host and applies when the room is unlocked."
          : "Writing permission has been revoked by the host. You are in view-only mode.",
      });
    }

    // Broadcast to all participants in room
    io.to(state.currentRoomId).emit("user-permission-changed", {
      userId: targetUserId,
      canWrite,
      role,
    });

    persistRoomAccess(room);
  });

  // Admin: Kick / Remove User from Room
  safeOn("admin-kick-user", (payload: { targetUserId: string; reason?: string }) => {
    if (!state.currentRoomId || !state.currentUser || !state.currentUser.isHost) return;
    if (!isRecord(payload)) return;
    const targetUserId = readId(payload.targetUserId);
    const reason = readString(payload.reason, MAX_REASON_LENGTH) || undefined;
    if (!targetUserId) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (targetUserId === state.currentUser.id) return; // Cannot kick host

    room.kickedUserIds.add(targetUserId);
    const targetUser = room.users[targetUserId];

    if (targetUser && targetUser.socketId) {
      // Kick every socket holding this identity so a second tab/window cannot
      // keep editing after the user is removed.
      const socketsToKick = targetUser.socketIds?.length
        ? targetUser.socketIds
        : [targetUser.socketId];
      for (const socketId of socketsToKick) {
        io.to(socketId).emit("kicked", {
          reason: reason || "You were removed from this room by the host.",
        });
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.data.kicked = true;
          targetSocket.leave(state.currentRoomId);
          targetSocket.disconnect(true);
        }
      }
    }

    delete room.users[targetUserId];
    syncVoteEligibility(io, room);

    io.to(state.currentRoomId).emit("user-kicked", {
      userId: targetUserId,
      userName: targetUser?.name || "Participant",
      reason: reason || "Removed by room administrator",
    });
    io.to(state.currentRoomId).emit("user-left", { userId: targetUserId });

    persistRoomAccess(room);
  });

  // Admin: Toggle Lock Whiteboard
  safeOn("admin-toggle-lock", (payload: { isLocked: boolean }) => {
    if (!state.currentRoomId || !state.currentUser || !state.currentUser.isHost) return;
    if (!isRecord(payload)) return;
    const isLocked = readBoolean(payload.isLocked);
    if (isLocked === null) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    room.isLocked = isLocked;

    // Update live participants and persisted permissions, including users
    // who are currently offline. Explicit host grants/revocations are kept,
    // so an unlock cannot silently restore access the host removed (#70).
    applyLockToStoredPermissions(room.userPermissions, isLocked, room.creatorId);
    Object.values(room.users).forEach((u) => {
      if (u.isHost) return;
      const resolved = effectivePermission(room.userPermissions[u.id], isLocked);
      u.canWrite = resolved.canWrite;
      u.role = resolved.role;
      if (!room.userPermissions[u.id]) {
        room.userPermissions[u.id] = { ...resolved };
      }
    });
    syncVoteEligibility(io, room);

    io.to(state.currentRoomId).emit("room-lock-changed", {
      isLocked: room.isLocked,
      users: room.users,
    });

    persistRoomAccess(room);
  });

  // Admin: Delete Room
  safeOn("admin-delete-room", async (payload?: { roomId?: string }) => {
    const targetRoomId = isRecord(payload)
      ? readString(payload.roomId, MAX_ID_LENGTH) || state.currentRoomId
      : state.currentRoomId;
    if (!targetRoomId || !state.currentUser) return;
    const room = rooms.get(targetRoomId);

    // Only the host of the room being deleted may delete it. Falls back to a
    // creator check for authenticated accounts that are not in the room.
    const isRoomHost = Boolean(state.currentRoomId === targetRoomId && state.currentUser.isHost);
    const meta = await getRoomMeta(targetRoomId);
    let creatorId = room?.creatorId || meta?.creatorId;

    // The first in-memory host may still be waiting for its claim to persist.
    if (!creatorId && isRoomHost) {
      creatorId = state.currentUser.id;
      if (room) {
        room.creatorId = creatorId;
        room.creatorName = state.currentUser.name;
        void transferRoomOwnership(targetRoomId, creatorId, state.currentUser.name);
      }
    }

    if (!creatorId || (!isRoomHost && creatorId !== state.currentUser.id)) {
      socket.emit("permission-denied", {
        message: "Only the room host or creator can delete this room.",
      });
      return;
    }

    const deleted = await deleteRoom(targetRoomId, state.currentUser.id, creatorId);
    if (!deleted) {
      socket.emit("permission-denied", {
        message: "Only the room host or creator can delete this room.",
      });
      return;
    }

    await completeRoomDeletion(io, targetRoomId, state.currentUser.id);
  });

  // Disconnect
  safeOn("disconnect", () => {
    clearLiveStrokes();
    joinSocketLimiter.clear(socket.id);
    signalingLimiter.clear(socket.id);
    if (!state.currentRoomId || !state.currentUser) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;

    // Multiple tabs/sockets can share one account identity. Hand the presence
    // entry to a remaining socket instead of removing the user entirely.
    const presence = room.users[state.currentUser.id];
    if (presence) {
      const sockets = presence.socketIds?.length ? presence.socketIds : [presence.socketId];
      const remaining = sockets.filter((sid) => sid !== socket.id);
      if (remaining.length > 0) {
        presence.socketId = remaining[remaining.length - 1];
        presence.socketIds = remaining;
        return;
      }
    }

    const wasHost = Boolean(room.users[state.currentUser.id]?.isHost ?? state.currentUser.isHost);
    delete room.users[state.currentUser.id];
    socket.to(state.currentRoomId).emit("user-left", { userId: state.currentUser.id });

    // Host Migration: If the host left and other participants remain, promote next active user
    if (wasHost) {
      migrateRoomHost(io, room, state.currentUser.id);
    }

    // Prune the departing user's vote after migration so a newly promoted
    // host is counted correctly (#69).
    syncVoteEligibility(io, room);

    const remainingUserIds = Object.keys(room.users);

    // Clean up empty rooms after 1 hour if no one is in them (#104).
    if (remainingUserIds.length === 0) {
      roomLifecycle.scheduleCleanup(state.currentRoomId);
    }
  });
}
