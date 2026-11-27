import type { Socket, Server as SocketIOServer } from "socket.io";
import { guardSocketHandler } from "../socketHandler";
import type { UserSession } from "../roomTypes";
import type { SocketState } from "./types";
import { registerRoomHandlers, joinSocketLimiter, joinIpLimiter } from "./roomHandler";
import { registerCanvasHandlers } from "./canvasHandler";
import { registerVoiceHandlers, signalingLimiter } from "./voiceHandler";
import { isRoomRestoring } from "../boardSnapshots";

export { joinSocketLimiter, joinIpLimiter, signalingLimiter };

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUser: UserSession | null = null;

    // Lets the room-deletion handler clear this socket's stale room state before
    // detaching it, so no later emit can write to the deleted room (#72).
    socket.data.clearRoomState = () => {
      currentRoomId = null;
      currentUser = null;
    };

    // Per-socket live-stroke accounting. Without a cap, one writer could stream
    // unlimited points into every participant's in-memory liveStrokes map.
    const liveStrokes = new Map<string, { count: number; expiresAt: number }>();
    const clearLiveStrokes = () => liveStrokes.clear();
    const pruneLiveStrokes = (now: number) => {
      for (const [id, state] of liveStrokes) {
        if (state.expiresAt <= now) liveStrokes.delete(id);
      }
    };

    // Drop all incoming socket events if socket was kicked
    socket.use((_packet, next) => {
      if (socket.data.kicked) {
        return;
      }
      next();
    });

    // Helper: Guard write operations
    const checkCanWrite = (): boolean => {
      if (!currentUser) return false;
      // A restore replaces the whole element map; reject writes until it finishes
      // so a pending mutation cannot be applied to or persisted over it (#227).
      if (currentRoomId && isRoomRestoring(currentRoomId)) {
        socket.emit("permission-denied", { message: "Board restore in progress" });
        return false;
      }
      if (currentUser.isHost) return true;
      if (currentUser.canWrite) return true;
      socket.emit("permission-denied", {
        message: "Your drawing and editing permissions are currently restricted in this room.",
      });
      return false;
    };

    /**
     * Socket.IO dispatches listeners without catching thrown errors. A single
     * malformed payload would otherwise become an uncaughtException and kill
     * the whole process, so every handler is wrapped and reports a safe error.
     */
    const safeOn = <T extends (...args: any[]) => void | Promise<void>>(
      event: string,
      handler: T
    ) => {
      socket.on(
        event,
        guardSocketHandler(handler, (err) => {
          console.error(`[Socket] Handler "${event}" failed:`, err);
          socket.emit("room-error", { message: "Could not process that request." });
        })
      );
    };

    const state: SocketState = {
      get currentRoomId() {
        return currentRoomId;
      },
      set currentRoomId(val: string | null) {
        currentRoomId = val;
      },
      get currentUser() {
        return currentUser;
      },
      set currentUser(val: UserSession | null) {
        currentUser = val;
      },
      liveStrokes,
      clearLiveStrokes,
      pruneLiveStrokes,
      checkCanWrite,
      safeOn,
    };

    registerRoomHandlers({ io, socket, state });
    registerCanvasHandlers({ io, socket, state });
    registerVoiceHandlers({ io, socket, state });
  });
}
