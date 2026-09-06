import express from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";

interface CanvasElement {
  id: string;
  type: 'stroke' | 'sticky' | 'text';
  [key: string]: any;
}

interface UserSession {
  id: string;
  socketId: string;
  name: string;
  color: string;
  roomId: string;
  cursor?: { x: number; y: number; tool?: string; isDrawing?: boolean };
  isSpeaking?: boolean;
  audioLevel?: number;
  isHost?: boolean;
}

interface VoteState {
  active: boolean;
  initiatorId: string;
  initiatorName: string;
  votes: Record<string, boolean>;
  totalEligible: number;
  startedAt: number;
  durationMs: number;
}

interface RoomData {
  id: string;
  elements: Record<string, CanvasElement>;
  users: Record<string, UserSession>;
  voteToClear: VoteState | null;
  voteTimer?: NodeJS.Timeout | null;
}

const PORT = 3000;
const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      elements: {},
      users: {},
      voteToClear: null,
      voteTimer: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 5e6, // 5MB for dense drawing batches
  });

  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      activeRooms: rooms.size,
      timestamp: Date.now(),
    });
  });

  // Room status check
  app.get("/api/room/:roomId", (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    if (!room) {
      res.json({ exists: false, userCount: 0 });
      return;
    }
    res.json({
      exists: true,
      userCount: Object.keys(room.users).length,
      elementCount: Object.keys(room.elements).length,
    });
  });

  // Socket.io Real-time Handlers
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUser: UserSession | null = null;

    // Join room
    socket.on("join-room", (data: { roomId: string; user: { id: string; name: string; color: string } }) => {
      const { roomId, user } = data;
      currentRoomId = roomId;
      socket.join(roomId);

      const room = getOrCreateRoom(roomId);
      const isFirstUser = Object.keys(room.users).length === 0;

      currentUser = {
        id: user.id,
        socketId: socket.id,
        name: user.name,
        color: user.color,
        roomId,
        isHost: isFirstUser,
        isSpeaking: false,
        audioLevel: 0,
      };

      room.users[user.id] = currentUser;

      // Send initial room state to connecting user
      socket.emit("room-init", {
        roomId,
        elements: room.elements,
        users: room.users,
        voteToClear: room.voteToClear,
        yourRole: currentUser.isHost ? "host" : "member",
      });

      // Broadcast user-joined to other users in room
      socket.to(roomId).emit("user-joined", currentUser);
    });

    // Real-time live stroke streaming
    socket.on("stroke-live-start", (payload: { strokeId: string; point: { x: number; y: number }; color: string; size: number; isHighlighter?: boolean }) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit("stroke-live-started", {
        userId: currentUser?.id,
        ...payload,
      });
    });

    socket.on("stroke-live-point", (payload: { strokeId: string; point: { x: number; y: number } }) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit("stroke-live-pointed", payload);
    });

    // Final element creation (persisted)
    socket.on("element-create", (element: CanvasElement) => {
      if (!currentRoomId) return;
      const room = getOrCreateRoom(currentRoomId);
      room.elements[element.id] = element;
      // Broadcast to all other clients in the room
      socket.to(currentRoomId).emit("element-created", element);
    });

    // Element update (e.g. moving sticky note or updating text)
    socket.on("element-update", (element: CanvasElement) => {
      if (!currentRoomId) return;
      const room = getOrCreateRoom(currentRoomId);
      if (room.elements[element.id]) {
        room.elements[element.id] = { ...room.elements[element.id], ...element };
      } else {
        room.elements[element.id] = element;
      }
      socket.to(currentRoomId).emit("element-updated", element);
    });

    // Element delete
    socket.on("element-delete", (payload: { elementId: string }) => {
      if (!currentRoomId) return;
      const room = getOrCreateRoom(currentRoomId);
      delete room.elements[payload.elementId];
      socket.to(currentRoomId).emit("element-deleted", payload);
    });

    // Batch elements delete (e.g. eraser dragged across multiple strokes)
    socket.on("elements-batch-delete", (payload: { elementIds: string[] }) => {
      if (!currentRoomId) return;
      const room = getOrCreateRoom(currentRoomId);
      payload.elementIds.forEach((id) => {
        delete room.elements[id];
      });
      socket.to(currentRoomId).emit("elements-batch-deleted", payload);
    });

    // Multiplayer cursor movement
    socket.on("cursor-move", (cursor: { x: number; y: number; tool?: string; isDrawing?: boolean }) => {
      if (!currentRoomId || !currentUser) return;
      currentUser.cursor = cursor;
      socket.to(currentRoomId).emit("cursor-moved", {
        userId: currentUser.id,
        cursor,
      });
    });

    // Audio reactivity / Speaking indicator
    socket.on("audio-level", (data: { level: number; isSpeaking: boolean }) => {
      if (!currentRoomId || !currentUser) return;
      currentUser.audioLevel = data.level;
      currentUser.isSpeaking = data.isSpeaking;
      socket.to(currentRoomId).emit("audio-level-updated", {
        userId: currentUser.id,
        level: data.level,
        isSpeaking: data.isSpeaking,
      });
    });

    // Vote to Clear Feature
    socket.on("vote-clear-start", () => {
      if (!currentRoomId || !currentUser) return;
      const room = getOrCreateRoom(currentRoomId);
      const userIds = Object.keys(room.users);

      // If only 1 user, clear immediately
      if (userIds.length <= 1) {
        room.elements = {};
        io.to(currentRoomId).emit("board-cleared", {
          initiatorName: currentUser.name,
          wasVoted: false,
        });
        return;
      }

      // If a vote is already active, ignore
      if (room.voteToClear && room.voteToClear.active) return;

      const durationMs = 15000;
      const newVote: VoteState = {
        active: true,
        initiatorId: currentUser.id,
        initiatorName: currentUser.name,
        votes: {
          [currentUser.id]: true, // Initiator votes yes by default
        },
        totalEligible: userIds.length,
        startedAt: Date.now(),
        durationMs,
      };

      room.voteToClear = newVote;

      io.to(currentRoomId).emit("vote-clear-started", newVote);

      // Clear any previous timer
      if (room.voteTimer) clearTimeout(room.voteTimer);

      room.voteTimer = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.voteToClear) return;

        // Check votes at expiration
        const yesCount = Object.values(currentRoom.voteToClear.votes).filter(Boolean).length;
        const total = Object.keys(currentRoom.users).length;
        const passed = yesCount > total / 2;

        if (passed) {
          currentRoom.elements = {};
          io.to(roomId).emit("board-cleared", {
            initiatorName: currentRoom.voteToClear.initiatorName,
            wasVoted: true,
          });
        }

        io.to(roomId).emit("vote-clear-ended", {
          passed,
          yesCount,
          totalEligible: total,
          reason: "timed_out",
        });

        currentRoom.voteToClear = null;
        currentRoom.voteTimer = null;
      }, durationMs);
    });

    const roomId = currentRoomId || "";

    socket.on("vote-clear-cast", (data: { vote: boolean }) => {
      if (!currentRoomId || !currentUser) return;
      const room = getOrCreateRoom(currentRoomId);
      if (!room.voteToClear || !room.voteToClear.active) return;

      room.voteToClear.votes[currentUser.id] = data.vote;

      const userIds = Object.keys(room.users);
      const yesCount = Object.values(room.voteToClear.votes).filter(Boolean).length;
      const noCount = Object.values(room.voteToClear.votes).filter((v) => v === false).length;
      const totalEligible = userIds.length;

      // Broadcast updated votes
      io.to(currentRoomId).emit("vote-clear-updated", room.voteToClear);

      // If majority yes reached early
      if (yesCount > totalEligible / 2) {
        if (room.voteTimer) clearTimeout(room.voteTimer);
        room.elements = {};
        io.to(currentRoomId).emit("board-cleared", {
          initiatorName: room.voteToClear.initiatorName,
          wasVoted: true,
        });
        io.to(currentRoomId).emit("vote-clear-ended", {
          passed: true,
          yesCount,
          totalEligible,
          reason: "majority_reached",
        });
        room.voteToClear = null;
        room.voteTimer = null;
        return;
      }

      // If impossible to pass (noCount >= totalEligible / 2)
      if (noCount >= totalEligible / 2 && totalEligible > 2) {
        if (room.voteTimer) clearTimeout(room.voteTimer);
        io.to(currentRoomId).emit("vote-clear-ended", {
          passed: false,
          yesCount,
          totalEligible,
          reason: "rejected",
        });
        room.voteToClear = null;
        room.voteTimer = null;
      }
    });

    socket.on("vote-clear-cancel", () => {
      if (!currentRoomId || !currentUser) return;
      const room = getOrCreateRoom(currentRoomId);
      if (!room.voteToClear || !room.voteToClear.active) return;
      if (room.voteToClear.initiatorId !== currentUser.id) return;

      if (room.voteTimer) clearTimeout(room.voteTimer);
      room.voteToClear = null;
      room.voteTimer = null;

      io.to(currentRoomId).emit("vote-clear-ended", {
        passed: false,
        yesCount: 0,
        totalEligible: Object.keys(room.users).length,
        reason: "cancelled_by_initiator",
      });
    });

    // Direct clear (if user confirms solo or forced)
    socket.on("clear-board-direct", () => {
      if (!currentRoomId || !currentUser) return;
      const room = getOrCreateRoom(currentRoomId);
      room.elements = {};
      io.to(currentRoomId).emit("board-cleared", {
        initiatorName: currentUser.name,
        wasVoted: false,
      });
    });

    // Disconnect
    socket.on("disconnect", () => {
      if (!currentRoomId || !currentUser) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      delete room.users[currentUser.id];
      socket.to(currentRoomId).emit("user-left", { userId: currentUser.id });

      // If active vote, update total
      if (room.voteToClear && room.voteToClear.active) {
        delete room.voteToClear.votes[currentUser.id];
        room.voteToClear.totalEligible = Object.keys(room.users).length;
        io.to(currentRoomId).emit("vote-clear-updated", room.voteToClear);
      }

      // Clean up empty rooms after 1 hour if no one is in them
      if (Object.keys(room.users).length === 0) {
        setTimeout(() => {
          const r = rooms.get(currentRoomId!);
          if (r && Object.keys(r.users).length === 0) {
            rooms.delete(currentRoomId!);
          }
        }, 3600000);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Collaborative Whiteboard server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
