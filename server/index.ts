import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { Server as SocketIOServer, Socket } from "socket.io";
import {
  registerUser,
  loginUser,
  createGuestUser,
  findOrCreateGoogleUser,
  getUserByToken,
  saveRoomMeta,
  getRoomMeta,
  getRoomsForUser,
  generateRoomCode,
  loadRoomElements,
  saveRoomElements,
  saveRoomElementsDebounced,
  deleteRoom,
} from "./auth";
import { connectDb } from "./db";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables cleanly
const envPath = fs.existsSync(path.resolve(__dirname, ".env"))
  ? path.resolve(__dirname, ".env")
  : path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
  role?: 'admin' | 'editor' | 'viewer';
  canWrite?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  voiceConnected?: boolean;
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
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
  kickedUserIds: Set<string>;
  userPermissions: Record<string, { canWrite: boolean; role: 'admin' | 'editor' | 'viewer' }>;
  elements: Record<string, CanvasElement>;
  users: Record<string, UserSession>;
  voteToClear: VoteState | null;
  voteTimer?: NodeJS.Timeout | null;
}

const PORT = Number(process.env.PORT) || 3000;
const VOTE_CLEAR_DURATION_MS = Number(process.env.VOTE_CLEAR_DURATION_MS) || 15000;
const rooms = new Map<string, RoomData>();

async function getOrCreateRoom(roomId: string): Promise<RoomData> {
  let room = rooms.get(roomId);
  if (!room) {
    const meta = await getRoomMeta(roomId);
    const persistedElements = await loadRoomElements(roomId);
    room = {
      id: roomId,
      name: meta?.name || `Room ${roomId}`,
      creatorId: meta?.creatorId || '',
      creatorName: meta?.creatorName || '',
      createdAt: meta?.createdAt || Date.now(),
      isLocked: meta?.isLocked || false,
      kickedUserIds: new Set<string>(),
      userPermissions: {},
      elements: persistedElements || {},
      users: {},
      voteToClear: null,
      voteTimer: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

const ALLOWED_ORIGIN_SET = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

const rawAllowed = [process.env.APP_URL, process.env.CLIENT_URL, process.env.ALLOWED_ORIGINS]
  .filter(Boolean)
  .flatMap((val) => (val as string).split(","));

for (const raw of rawAllowed) {
  try {
    const trimmed = raw.trim();
    if (trimmed) {
      const parsed = new URL(trimmed);
      ALLOWED_ORIGIN_SET.add(parsed.origin);
    }
  } catch {}
}

function resolveTrustedOrigin(rawOrigin?: string): string {
  if (!rawOrigin) return (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  try {
    const originUrl = new URL(rawOrigin).origin;
    if (ALLOWED_ORIGIN_SET.has(originUrl)) {
      return originUrl;
    }
  } catch {}
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

// In-memory rate limiter to protect against credential stuffing / brute-force
const authRateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Periodic pruning of expired rate-limit records
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of authRateLimitMap.entries()) {
    if (now > record.resetTime) {
      authRateLimitMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

function authRateLimiter(maxRequests = 30, windowMs = 60000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
    const now = Date.now();
    const record = authRateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      authRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please slow down and try again shortly.",
      });
      return;
    }
    next();
  };
}

async function startServer() {
  await connectDb();
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        try {
          const originUrl = new URL(requestOrigin).origin;
          if (ALLOWED_ORIGIN_SET.has(originUrl)) {
            return callback(null, true);
          }
        } catch {}
        return callback(new Error("CORS origin not permitted"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 5e6, // 5MB for dense drawing batches
  });

  // Cross-Origin Resource Sharing (CORS) Middleware for API routes
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGIN_SET.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Security Headers Middleware
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
      res.status(400).json({ success: false, error: 'Malformed JSON payload' });
      return;
    }
    next(err);
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      activeRooms: rooms.size,
      timestamp: Date.now(),
    });
  });

  // Authentication Routes with Rate Limiting
  app.post("/api/auth/register", authRateLimiter(15, 60000), async (req, res) => {
    try {
      const { username, email, password, name, color } = req.body;
      const result = await registerUser({ username, email, password, name, color });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter(15, 60000), async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const result = await loginUser(identifier, password);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Login failed" });
    }
  });

  app.post("/api/auth/guest", authRateLimiter(30, 60000), async (req, res) => {
    try {
      const { name, color } = req.body;
      const result = await createGuestUser(name, color);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Guest session failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
      if (!token) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }
      const user = await getUserByToken(token);
      if (!user) {
        res.status(401).json({ success: false, error: "Invalid session token" });
        return;
      }
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Authentication check failed" });
    }
  });

  // Google OAuth URL generator
  app.get("/api/auth/google/url", (req, res) => {
    const originParam = (req.query.origin as string)?.trim();
    const reqOrigin = originParam || req.get("origin") || "";
    const trustedOrigin = resolveTrustedOrigin(reqOrigin);
    const redirectUri = `${trustedOrigin}/auth/google/callback`;
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

    if (!clientId) {
      res.json({
        configured: false,
        redirectUri,
        message: "GOOGLE_CLIENT_ID not configured in server/.env",
      });
      return;
    }

    const state = Buffer.from(JSON.stringify({ redirectUri, origin: trustedOrigin })).toString("base64url");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state,
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({
      configured: true,
      url: googleAuthUrl,
      redirectUri,
    });
  });

  // Google OAuth Callback Handler (Popup Window)
  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
    const { code, error, state } = req.query;

    let targetOrigin = resolveTrustedOrigin();
    if (state && typeof state === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        if (decoded.origin) {
          targetOrigin = resolveTrustedOrigin(decoded.origin);
        }
      } catch {}
    }

    if (error || !code) {
      const rawErrMsg = (error as string) || "Authorization was cancelled or code was not returned";
      const safeErrMsg = escapeHtml(rawErrMsg);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Google Sign-In Cancelled or Failed</h3>
            <p>${safeErrMsg}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${JSON.stringify(rawErrMsg)} }, ${JSON.stringify(targetOrigin)});
                setTimeout(() => window.close(), 1500);
              } else {
                setTimeout(() => { window.location.href = '/'; }, 2000);
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    try {
      // Decode state to retrieve the exact redirectUri used during the authorization request
      let redirectUri = `${targetOrigin}/auth/google/callback`;
      if (state && typeof state === 'string') {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
          if (decoded.redirectUri) {
            redirectUri = decoded.redirectUri;
          }
        } catch {}
      }

      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials are not fully configured in server/.env");
      }

      // Exchange code for Google access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange Google authorization code");
      }

      // Fetch user profile from Google UserInfo endpoint
      const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await userinfoResponse.json();

      if (!userinfoResponse.ok || !profile.email) {
        throw new Error("Unable to retrieve profile from Google");
      }

      const result = await findOrCreateGoogleUser({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      });

      // Send postMessage to main window with validated targetOrigin and close popup
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Succeeded</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#f0fdf4;color:#166534;">
            <h3>Connected with Google</h3>
            <p>Closing popup window...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'GOOGLE_OAUTH_SUCCESS',
                  token: ${JSON.stringify(result.token)},
                  user: ${JSON.stringify(result.user)}
                }, ${JSON.stringify(targetOrigin)});
                setTimeout(() => window.close(), 300);
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      const rawErrMsg = err.message || "OAuth exchange error";
      const safeErrMsg = escapeHtml(rawErrMsg);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Google Sign-In Error</h3>
            <p>${safeErrMsg}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${JSON.stringify(rawErrMsg)} }, ${JSON.stringify(targetOrigin)});
                setTimeout(() => window.close(), 2500);
              }
            </script>
          </body>
        </html>
      `);
    }
  });

  // Session Room Creation & Management Routes
  app.post("/api/rooms/create", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
      const user = token ? await getUserByToken(token) : null;

      const { name, customCode, isLocked } = req.body;
      let roomId = customCode ? customCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-") : generateRoomCode();
      if (!roomId || roomId.length < 2) roomId = generateRoomCode();

      const creatorId = user ? user.id : req.body.creatorId || "guest_" + Math.random().toString(36).substring(2, 8);
      const creatorName = user ? user.name : req.body.creatorName || "Session Host";

      const roomMeta = {
        id: roomId,
        name: name?.trim() || `Session ${roomId}`,
        creatorId,
        creatorName,
        createdAt: Date.now(),
        isLocked: !!isLocked,
      };

      await saveRoomMeta(roomMeta);

      const room = await getOrCreateRoom(roomId);
      room.name = roomMeta.name;
      room.creatorId = creatorId;
      room.creatorName = creatorName;
      room.isLocked = !!isLocked;

      res.json({ success: true, room: roomMeta });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Could not create session room" });
    }
  });

  app.get("/api/rooms/my-rooms", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
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

  // Delete Room endpoint
  app.delete("/api/rooms/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
      const user = token ? await getUserByToken(token) : null;

      const roomData = rooms.get(roomId);
      const meta = await getRoomMeta(roomId);
      const creatorId = roomData?.creatorId || meta?.creatorId;

      // Verify authorization: if user token exists and creator is known, require ownership
      if (user && creatorId && creatorId !== user.id) {
        res.status(403).json({ success: false, error: "Only the room creator can delete this room" });
        return;
      }

      const success = await deleteRoom(roomId, user?.id);

      // Notify and clean up active socket room
      if (rooms.has(roomId)) {
        io.to(roomId).emit("room-deleted", {
          roomId,
          message: "This room has been permanently deleted by the host.",
        });
        io.in(roomId).socketsLeave(roomId);
        rooms.delete(roomId);
      }

      res.json({ success, roomId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to delete room" });
    }
  });

  // Socket.io Real-time Handlers
  io.on("connection", (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUser: UserSession | null = null;

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
      if (currentUser.isHost) return true;
      if (currentUser.canWrite) return true;
      socket.emit("permission-denied", {
        message: "Your drawing and editing permissions are currently restricted in this room.",
      });
      return false;
    };

    // Join room
    socket.on("join-room", async (data: { roomId: string; user: { id: string; name: string; color: string; username?: string }; token?: string }) => {
      const { roomId, user, token } = data;
      const room = await getOrCreateRoom(roomId);

      // Verify if user was kicked by the host
      if (room.kickedUserIds.has(user.id)) {
        socket.emit("kicked", {
          reason: "You have been removed from this room by the host.",
        });
        return;
      }

      currentRoomId = roomId;
      socket.join(roomId);

      // Authenticated user resolution
      const authenticatedUser = token ? await getUserByToken(token) : null;
      const actualUserId = user.id || socket.id;
      const actualName = authenticatedUser ? authenticatedUser.name : user.name;
      const actualColor = authenticatedUser ? authenticatedUser.color : user.color;
      const accountId = authenticatedUser ? authenticatedUser.id : null;

      // Determine Host / Admin status
      const isRoomCreator = Boolean(
        room.creatorId && (
          (accountId && room.creatorId === accountId) ||
          room.creatorId === actualUserId ||
          room.creatorId === user.id
        )
      );
      const isFirstUser = !room.creatorId && Object.keys(room.users).length === 0;

      if (isFirstUser && !room.creatorId) {
        room.creatorId = accountId || actualUserId;
        room.creatorName = actualName;
      }

      const isHost = isRoomCreator || isFirstUser;
      let canWrite = true;
      let role: 'admin' | 'editor' | 'viewer' = 'editor';

      if (isHost) {
        role = 'admin';
        canWrite = true;
      } else {
        const userPerm = room.userPermissions[actualUserId] || (accountId ? room.userPermissions[accountId] : undefined);
        if (userPerm) {
          canWrite = userPerm.canWrite;
          role = userPerm.role;
        } else {
          canWrite = !room.isLocked;
          role = room.isLocked ? 'viewer' : 'editor';
          room.userPermissions[actualUserId] = { canWrite, role };
        }
      }

      currentUser = {
        id: actualUserId,
        socketId: socket.id,
        name: actualName,
        color: actualColor,
        roomId,
        isHost,
        role,
        canWrite,
        isSpeaking: false,
        audioLevel: 0,
      };

      room.users[actualUserId] = currentUser;

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
        yourRole: currentUser.role,
        canWrite: currentUser.canWrite,
        isHost: currentUser.isHost,
      });

      // Broadcast user-joined to other users in room
      socket.to(roomId).emit("user-joined", currentUser);
    });

    // Admin: Set User Writing Permissions (Revoke / Grant)
    socket.on("admin-set-permission", (payload: { targetUserId: string; canWrite: boolean }) => {
      if (!currentRoomId || !currentUser || !currentUser.isHost) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const { targetUserId, canWrite } = payload;
      if (targetUserId === currentUser.id) return; // Host cannot revoke self

      const role: 'editor' | 'viewer' = canWrite ? 'editor' : 'viewer';
      room.userPermissions[targetUserId] = { canWrite, role };

      if (room.users[targetUserId]) {
        room.users[targetUserId].canWrite = canWrite;
        room.users[targetUserId].role = role;
      }

      // Notify the target user specifically
      const targetUser = room.users[targetUserId];
      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("permission-updated", {
          canWrite,
          role,
          message: canWrite
            ? "Writing permission has been granted by the host."
            : "Writing permission has been revoked by the host. You are in view-only mode.",
        });
      }

      // Broadcast to all participants in room
      io.to(currentRoomId).emit("user-permission-changed", {
        userId: targetUserId,
        canWrite,
        role,
      });
    });

    // Admin: Kick / Remove User from Room
    socket.on("admin-kick-user", (payload: { targetUserId: string; reason?: string }) => {
      if (!currentRoomId || !currentUser || !currentUser.isHost) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const { targetUserId, reason } = payload;
      if (targetUserId === currentUser.id) return; // Cannot kick host

      room.kickedUserIds.add(targetUserId);
      const targetUser = room.users[targetUserId];

      if (targetUser && targetUser.socketId) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        io.to(targetUser.socketId).emit("kicked", {
          reason: reason || "You were removed from this room by the host.",
        });
        if (targetSocket) {
          targetSocket.data.kicked = true;
          targetSocket.leave(currentRoomId);
          targetSocket.disconnect(true);
        }
      }

      delete room.users[targetUserId];

      io.to(currentRoomId).emit("user-kicked", {
        userId: targetUserId,
        userName: targetUser?.name || "Participant",
        reason: reason || "Removed by room administrator",
      });
      io.to(currentRoomId).emit("user-left", { userId: targetUserId });
    });

    // Admin: Toggle Lock Whiteboard
    socket.on("admin-toggle-lock", (payload: { isLocked: boolean }) => {
      if (!currentRoomId || !currentUser || !currentUser.isHost) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.isLocked = payload.isLocked;

      // Update non-host users
      Object.values(room.users).forEach((u) => {
        if (!u.isHost) {
          u.canWrite = !payload.isLocked;
          u.role = payload.isLocked ? 'viewer' : 'editor';
          room.userPermissions[u.id] = { canWrite: u.canWrite, role: u.role };
        }
      });

      io.to(currentRoomId).emit("room-lock-changed", {
        isLocked: room.isLocked,
        users: room.users,
      });
    });

    // Admin: Delete Room
    socket.on("admin-delete-room", async (payload?: { roomId?: string }) => {
      const targetRoomId = payload?.roomId || currentRoomId;
      if (!targetRoomId || !currentUser) return;
      const room = rooms.get(targetRoomId);
      const meta = await getRoomMeta(targetRoomId);
      const creatorId = room?.creatorId || meta?.creatorId;

      if (!currentUser.isHost && creatorId && creatorId !== currentUser.id) {
        socket.emit("permission-denied", {
          message: "Only the room host or creator can delete this room.",
        });
        return;
      }

      await deleteRoom(targetRoomId, currentUser.id);

      io.to(targetRoomId).emit("room-deleted", {
        roomId: targetRoomId,
        message: "This room has been permanently deleted by the host.",
      });
      io.in(targetRoomId).socketsLeave(targetRoomId);
      rooms.delete(targetRoomId);
    });

    // Real-time live stroke streaming (Guarded)
    socket.on("stroke-live-start", (payload: { strokeId: string; point: { x: number; y: number }; color: string; size: number; isHighlighter?: boolean }) => {
      if (!currentRoomId || !checkCanWrite()) return;
      socket.to(currentRoomId).emit("stroke-live-started", {
        userId: currentUser?.id,
        ...payload,
      });
    });

    socket.on("stroke-live-point", (payload: { strokeId: string; point: { x: number; y: number } }) => {
      if (!currentRoomId || !checkCanWrite()) return;
      socket.to(currentRoomId).emit("stroke-live-pointed", payload);
    });

    // Final element creation (persisted, Guarded)
    socket.on("element-create", (element: CanvasElement) => {
      if (!currentRoomId || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.elements[element.id] = element;
      saveRoomElementsDebounced(currentRoomId, room.elements, 400);
      socket.to(currentRoomId).emit("element-created", element);
    });

    // Batch element creation (e.g. converting solo canvas to multiplayer room, Guarded)
    socket.on("elements-batch-create", (elementsList: CanvasElement[]) => {
      if (!currentRoomId || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room || !Array.isArray(elementsList)) return;
      elementsList.forEach((el) => {
        if (el && el.id) {
          room.elements[el.id] = el;
        }
      });
      saveRoomElementsDebounced(currentRoomId, room.elements, 400);
      socket.to(currentRoomId).emit("elements-batch-created", elementsList);
    });

    // Element update (e.g. moving sticky note or updating text, Guarded)
    socket.on("element-update", (element: CanvasElement) => {
      if (!currentRoomId || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      if (room.elements[element.id]) {
        room.elements[element.id] = { ...room.elements[element.id], ...element };
      } else {
        room.elements[element.id] = element;
      }
      saveRoomElementsDebounced(currentRoomId, room.elements, 800);
      socket.to(currentRoomId).emit("element-updated", element);
    });

    // Element delete (Guarded)
    socket.on("element-delete", (payload: { elementId: string }) => {
      if (!currentRoomId || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      delete room.elements[payload.elementId];
      saveRoomElementsDebounced(currentRoomId, room.elements, 400);
      socket.to(currentRoomId).emit("element-deleted", payload);
    });

    // Batch elements delete (e.g. eraser dragged across multiple strokes, Guarded)
    socket.on("elements-batch-delete", (payload: { elementIds: string[] }) => {
      if (!currentRoomId || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      payload.elementIds.forEach((id) => {
        delete room.elements[id];
      });
      saveRoomElementsDebounced(currentRoomId, room.elements, 400);
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

    // Voice Chat State & Mute/Deafen update
    socket.on("voice-status-update", (data: { isMuted?: boolean; isDeafened?: boolean; voiceConnected?: boolean }) => {
      if (!currentRoomId || !currentUser) return;
      if (typeof data.isMuted === 'boolean') currentUser.isMuted = data.isMuted;
      if (typeof data.isDeafened === 'boolean') currentUser.isDeafened = data.isDeafened;
      if (typeof data.voiceConnected === 'boolean') currentUser.voiceConnected = data.voiceConnected;

      socket.to(currentRoomId).emit("voice-status-updated", {
        userId: currentUser.id,
        isMuted: currentUser.isMuted,
        isDeafened: currentUser.isDeafened,
        voiceConnected: currentUser.voiceConnected,
      });
    });

    // WebRTC Voice Signaling Mesh
    socket.on("voice-offer", (payload: { toUserId: string; offer: any }) => {
      if (!currentRoomId || !currentUser) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const targetUser = room.users[payload.toUserId];
      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("voice-offer", {
          fromUserId: currentUser.id,
          offer: payload.offer,
        });
      }
    });

    socket.on("voice-answer", (payload: { toUserId: string; answer: any }) => {
      if (!currentRoomId || !currentUser) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const targetUser = room.users[payload.toUserId];
      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("voice-answer", {
          fromUserId: currentUser.id,
          answer: payload.answer,
        });
      }
    });

    socket.on("voice-ice-candidate", (payload: { toUserId: string; candidate: any }) => {
      if (!currentRoomId || !currentUser) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const targetUser = room.users[payload.toUserId];
      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("voice-ice-candidate", {
          fromUserId: currentUser.id,
          candidate: payload.candidate,
        });
      }
    });


    // Vote to Clear Feature
    socket.on("vote-clear-start", () => {
      if (!currentRoomId || !currentUser || !checkCanWrite()) return;
      const targetRoomId = currentRoomId;
      const room = rooms.get(targetRoomId);
      if (!room) return;
      const userIds = Object.keys(room.users);

      // If only 1 user, clear immediately
      if (userIds.length <= 1) {
        room.elements = {};
        saveRoomElements(targetRoomId, {});
        io.to(targetRoomId).emit("board-cleared", {
          initiatorName: currentUser.name,
          wasVoted: false,
        });
        return;
      }

      // If a vote is already active, ignore
      if (room.voteToClear && room.voteToClear.active) return;

      const durationMs = VOTE_CLEAR_DURATION_MS;
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

      io.to(targetRoomId).emit("vote-clear-started", newVote);

      // Clear any previous timer
      if (room.voteTimer) clearTimeout(room.voteTimer);

      room.voteTimer = setTimeout(() => {
        const currentRoom = rooms.get(targetRoomId);
        if (!currentRoom || !currentRoom.voteToClear) return;

        // Check votes at expiration
        const yesCount = Object.values(currentRoom.voteToClear.votes).filter(Boolean).length;
        const total = Object.keys(currentRoom.users).length;
        const passed = yesCount > total / 2;

        if (passed) {
          currentRoom.elements = {};
          saveRoomElements(targetRoomId, {});
          io.to(targetRoomId).emit("board-cleared", {
            initiatorName: currentRoom.voteToClear.initiatorName,
            wasVoted: true,
          });
        }

        io.to(targetRoomId).emit("vote-clear-ended", {
          passed,
          yesCount,
          totalEligible: total,
          reason: "timed_out",
        });

        currentRoom.voteToClear = null;
        currentRoom.voteTimer = null;
      }, durationMs);
    });

    socket.on("vote-clear-cast", (data: { vote: boolean }) => {
      if (!currentRoomId || !currentUser) return;
      const room = rooms.get(currentRoomId);
      if (!room || !room.voteToClear || !room.voteToClear.active) return;

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
        saveRoomElements(currentRoomId, {});
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
      const room = rooms.get(currentRoomId);
      if (!room || !room.voteToClear || !room.voteToClear.active) return;
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
      if (!currentRoomId || !currentUser || !checkCanWrite()) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.elements = {};
      saveRoomElements(currentRoomId, {});
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

      const wasHost = !!currentUser.isHost;
      delete room.users[currentUser.id];
      socket.to(currentRoomId).emit("user-left", { userId: currentUser.id });

      // If active vote, update total
      if (room.voteToClear && room.voteToClear.active) {
        delete room.voteToClear.votes[currentUser.id];
        room.voteToClear.totalEligible = Object.keys(room.users).length;
        io.to(currentRoomId).emit("vote-clear-updated", room.voteToClear);
      }

      // Host Migration: If the host left and other participants remain, promote next active user
      const remainingUserIds = Object.keys(room.users);
      if (wasHost && remainingUserIds.length > 0) {
        const nextHostId = remainingUserIds[0];
        const nextHost = room.users[nextHostId];
        if (nextHost) {
          nextHost.isHost = true;
          nextHost.role = 'admin';
          nextHost.canWrite = true;
          room.creatorId = nextHost.id;
          room.creatorName = nextHost.name;
          room.userPermissions[nextHost.id] = { canWrite: true, role: 'admin' };

          io.to(currentRoomId).emit("room-host-migrated", {
            newHostId: nextHost.id,
            newHostName: nextHost.name,
            message: `${nextHost.name} is now the host of this room.`,
          });

          io.to(currentRoomId).emit("user-permission-changed", {
            userId: nextHost.id,
            canWrite: true,
            role: 'admin',
          });

          if (nextHost.socketId) {
            io.to(nextHost.socketId).emit("permission-updated", {
              canWrite: true,
              role: 'admin',
              message: "You have been promoted to Host/Admin of this room.",
            });
          }
        }
      }

      // Clean up empty rooms after 1 hour if no one is in them
      if (remainingUserIds.length === 0) {
        setTimeout(() => {
          const r = rooms.get(currentRoomId!);
          if (r && Object.keys(r.users).length === 0) {
            rooms.delete(currentRoomId!);
          }
        }, 3600000);
      }
    });
  });

  // 404 handler for unhandled API routes
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ success: false, error: "API endpoint not found" });
  });

  // Serve production client bundle if available
  const clientDist = path.resolve(__dirname, "../client/dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Collaborative Whiteboard server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
