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
  saveRoomAccessState,
  claimRoomCreator,
  transferRoomOwnership,
  deleteRoom,
  flushAllPendingSaves,
} from "./auth";
import { connectDb, checkDbHealth } from "./db";
import { generateDiagram, reviseDiagram } from "./ai/generate";
import { getProviderSummary } from "./ai/providers";
import {
  coerceDiagramType,
  coerceDetailLevel,
  coerceDirection,
} from "./ai/types";
import type { ChatTurn, DiagramGraph } from "./ai/types";
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

/**
 * Serialize a value for safe embedding inside an inline <script> block.
 * Prevents `</script>` breakouts and JS line-separator injection.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

interface CanvasElement {
  id: string;
  type: 'stroke' | 'sticky' | 'text';
  [key: string]: any;
}

interface UserSession {
  id: string;
  socketId: string;
  /** Every socket currently holding this identity (multiple tabs/windows). */
  socketIds?: string[];
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
      kickedUserIds: new Set<string>(meta?.kickedUserIds || []),
      userPermissions: meta?.userPermissions || {},
      elements: persistedElements || {},
      users: {},
      voteToClear: null,
      voteTimer: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

/** Fire-and-forget persistence of a room's moderation state. */
function persistRoomAccess(room: RoomData) {
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

// In-memory rate limiter to protect against credential stuffing / brute-force.
// Buckets are namespaced per endpoint so exhausting one limit cannot block others.
const authRateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Periodic pruning of expired rate-limit records
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of authRateLimitMap.entries()) {
    if (now > record.resetTime) {
      authRateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

function authRateLimiter(maxRequests = 30, windowMs = 60000, bucket = "default") {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const record = authRateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      authRateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
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
  // Respect a single reverse proxy (Render/Railway/nginx) for client IPs.
  app.set("trust proxy", 1);
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

  // Health check endpoint (accessible via /health and /api/health)
  app.get(["/health", "/api/health"], async (_req, res) => {
    const dbHealth = await checkDbHealth();
    const isHealthy = dbHealth.connected;

    const healthData = {
      status: isHealthy ? "ok" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      activeRooms: rooms.size,
      services: {
        database: {
          status: dbHealth.connected ? "connected" : "disconnected",
          latencyMs: dbHealth.latencyMs,
          error: dbHealth.error,
        },
        socketServer: {
          status: "running",
          connectedClients: io.engine?.clientsCount || 0,
        },
      },
    };

    res.status(isHealthy ? 200 : 503).json(healthData);
  });

  // Authentication Routes with Rate Limiting
  app.post("/api/auth/register", authRateLimiter(15, 60000, "auth-register"), async (req, res) => {
    try {
      const { username, email, password, name, color } = req.body;
      const result = await registerUser({ username, email, password, name, color });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter(15, 60000, "auth-login"), async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const result = await loginUser(identifier, password);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Login failed" });
    }
  });

  app.post("/api/auth/guest", authRateLimiter(30, 60000, "auth-guest"), async (req, res) => {
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

  // Which AI engine is active (Gemini, local Ollama, or the fallback generator).
  app.get("/api/ai/config", (_req, res) => {
    const summary = getProviderSummary();
    res.json({
      success: true,
      provider: summary.provider,
      model: summary.model,
      label: summary.label,
    });
  });

  // AI Diagram Generation Route (Rate limited to 10 requests / min per IP)
  app.post("/api/ai/generate-diagram", authRateLimiter(10, 60000, "ai-generate"), async (req, res) => {
    try {
      const body = req.body ?? {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        res.status(400).json({ success: false, error: "Prompt is required" });
        return;
      }

      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
      const user = token ? await getUserByToken(token) : null;
      // Unauthenticated diagrams are credited to whichever engine actually
      // answered, so the author is resolved after the failover chain runs.
      const author = user ? { id: user.id, name: user.name } : undefined;

      const canvasCenter =
        body.canvasCenter &&
        Number.isFinite(Number(body.canvasCenter.x)) &&
        Number.isFinite(Number(body.canvasCenter.y))
          ? { x: Number(body.canvasCenter.x), y: Number(body.canvasCenter.y) }
          : { x: 0, y: 0 };

      const result = await generateDiagram({
        prompt: prompt.slice(0, 1200),
        type: coerceDiagramType(body.type),
        detail: coerceDetailLevel(body.detail),
        direction: coerceDirection(body.direction),
        canvasCenter,
        author,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[AI Generate Error]:", err.message);
      res.status(500).json({ success: false, error: err.message || "Failed to generate diagram" });
    }
  });

  // AI Follow-up Revision Route (stateless: client sends the current graph)
  app.post("/api/ai/revise-diagram", authRateLimiter(20, 60000, "ai-revise"), async (req, res) => {
    try {
      const body = req.body ?? {};
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (!instruction) {
        res.status(400).json({ success: false, error: "Instruction is required" });
        return;
      }

      const graph = body.graph as DiagramGraph | undefined;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        res.status(400).json({ success: false, error: "A valid diagram graph is required" });
        return;
      }

      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "")?.trim();
      const user = token ? await getUserByToken(token) : null;
      // Unauthenticated diagrams are credited to whichever engine actually
      // answered, so the author is resolved after the failover chain runs.
      const author = user ? { id: user.id, name: user.name } : undefined;

      const history: ChatTurn[] = Array.isArray(body.history)
        ? body.history
            .filter(
              (turn: any) =>
                turn &&
                (turn.role === "user" || turn.role === "assistant") &&
                typeof turn.content === "string"
            )
            .slice(-10)
            .map((turn: any) => ({
              role: turn.role,
              content: turn.content.slice(0, 600),
            }))
        : [];

      const canvasCenter =
        body.canvasCenter &&
        Number.isFinite(Number(body.canvasCenter.x)) &&
        Number.isFinite(Number(body.canvasCenter.y))
          ? { x: Number(body.canvasCenter.x), y: Number(body.canvasCenter.y) }
          : { x: 0, y: 0 };

      const result = await reviseDiagram({
        instruction: instruction.slice(0, 1200),
        graph,
        history,
        type: coerceDiagramType(body.type),
        detail: coerceDetailLevel(body.detail),
        direction: coerceDirection(body.direction),
        canvasCenter,
        author,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[AI Revision Error]:", err.message);
      res.status(500).json({ success: false, error: err.message || "Failed to revise diagram" });
    }
  });

  // Google OAuth URL generator
  app.get("/api/auth/google/url", (req, res) => {
    const originParam = (req.query.origin as string)?.trim();
    const reqOrigin = originParam || req.get("origin") || "";
    const trustedOrigin = resolveTrustedOrigin(reqOrigin);

    // The callback endpoint /auth/google/callback is hosted on this backend server
    const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const serverOrigin = (process.env.SERVER_URL || `${protocol}://${host}`).replace(/\/$/, "");
    const redirectUri = (process.env.GOOGLE_CALLBACK_URL || `${serverOrigin}/auth/google/callback`).trim();
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
      const safeErrMsgJs = safeJsonForScript(rawErrMsg);
      const safeTargetOriginJs = safeJsonForScript(targetOrigin);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Google Sign-In Cancelled or Failed</h3>
            <p>${safeErrMsg}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${safeErrMsgJs} }, ${safeTargetOriginJs});
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
      const safeTokenJs = safeJsonForScript(result.token);
      const safeUserJs = safeJsonForScript(result.user);
      const safeTargetOriginJs = safeJsonForScript(targetOrigin);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Succeeded</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#f0fdf4;color:#166534;">
            <h3>Connected with Google</h3>
            <p>Completing sign in...</p>
            <script>
              const token = ${safeTokenJs};
              const user = ${safeUserJs};
              const targetOrigin = ${safeTargetOriginJs};

              // 1. Save directly into localStorage for same-origin sessions
              try {
                localStorage.setItem('whiteboard_auth_token', token);
                localStorage.setItem('whiteboard_cached_user', JSON.stringify(user));
              } catch (e) {}

              // 2. Notify opener window if popup was used
              let notifiedOpener = false;
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({
                    type: 'GOOGLE_OAUTH_SUCCESS',
                    token: token,
                    user: user
                  }, targetOrigin);
                  notifiedOpener = true;
                  setTimeout(() => window.close(), 400);
                } catch (err) {
                  console.warn('Could not postMessage to opener:', err);
                }
              }

              // 3. Fallback: If no opener (e.g. redirected or popup blocked), redirect to app with auth_token in URL hash
              if (!notifiedOpener) {
                const redirectTarget = targetOrigin.replace(/\\/$/, '') + '/#auth_token=' + encodeURIComponent(token);
                setTimeout(() => {
                  window.location.href = redirectTarget;
                }, 200);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      const rawErrMsg = err.message || "OAuth exchange error";
      const safeErrMsg = escapeHtml(rawErrMsg);
      const safeErrMsgJs = safeJsonForScript(rawErrMsg);
      const safeTargetOriginJs = safeJsonForScript(targetOrigin);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Google Sign-In Error</h3>
            <p>${safeErrMsg}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${safeErrMsgJs} }, ${safeTargetOriginJs});
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

      // Anonymous creators send their stable guest identity so host rights
      // survive reloads. Authenticated callers are always resolved server-side.
      const requestedCreatorId =
        typeof req.body?.creatorId === "string" ? req.body.creatorId.trim().slice(0, 128) : "";
      const requestedCreatorName =
        typeof req.body?.creatorName === "string" ? req.body.creatorName.trim().slice(0, 48) : "";
      const creatorId = user
        ? user.id
        : requestedCreatorId || "guest_" + Math.random().toString(36).substring(2, 8);
      const creatorName = user
        ? user.name
        : requestedCreatorName || "Session Host";

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
      // Anonymous hosts prove ownership with the stable guest identity they
      // also use for sockets; authenticated callers are resolved from the token.
      const requestedCreatorId =
        typeof req.body?.creatorId === "string" ? req.body.creatorId.trim().slice(0, 128) : "";
      const requesterId = user?.id || requestedCreatorId;

      // Verify authorization: only the room creator may delete a room
      if (creatorId && creatorId !== requesterId) {
        res.status(403).json({ success: false, error: "Only the room creator can delete this room" });
        return;
      }

      const success = await deleteRoom(roomId, requesterId);

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
    socket.on("join-room", async (rawData: { roomId: string; user: { id: string; name: string; color: string; username?: string }; token?: string }) => {
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

      // Resolve identity server-side whenever a valid token is supplied so that
      // guests cannot spoof another account's id or host privileges.
      const authenticatedUser = typeof data.token === "string" && data.token
        ? await getUserByToken(data.token)
        : null;
      const accountId = authenticatedUser ? authenticatedUser.id : null;
      const providedUser = data.user && typeof data.user === "object" ? data.user : ({} as any);
      const actualUserId = (accountId || String(providedUser.id || socket.id)).slice(0, 128);
      const requestedName = String(providedUser.name || "").trim().slice(0, 48);
      const accountName = authenticatedUser ? String(authenticatedUser.name || "").trim().slice(0, 48) : "";
      const actualName = requestedName || accountName || "Guest";
      const requestedColor = typeof providedUser.color === "string" ? providedUser.color : "";
      const actualColorCandidate = /^#[0-9a-fA-F]{3,8}$/.test(requestedColor)
        ? requestedColor
        : authenticatedUser
        ? authenticatedUser.color
        : requestedColor;
      const actualColor = actualColorCandidate || "#3b82f6";

      const room = await getOrCreateRoom(roomId);

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
        currentUser && currentUser.id !== actualUserId
          ? room.userPermissions[currentUser.id]
          : undefined;
      const previousIdentityWasHost = Boolean(
        currentUser &&
          currentUser.id !== actualUserId &&
          currentRoomId === roomId &&
          currentUser.isHost
      );
      if (previousIdentityWasHost) {
        room.creatorId = accountId || actualUserId;
        room.creatorName = actualName;
        void transferRoomOwnership(roomId, room.creatorId, room.creatorName);
      }

      if (currentUser && currentUser.id !== actualUserId && currentRoomId === roomId) {
        delete room.users[currentUser.id];
        socket.to(roomId).emit("user-left", { userId: currentUser.id });
      }

      // Leave the previously joined room when switching rooms
      if (currentRoomId && currentRoomId !== roomId) {
        const previousRoom = rooms.get(currentRoomId);
        if (previousRoom && currentUser) {
          delete previousRoom.users[currentUser.id];
          socket.to(currentRoomId).emit("user-left", { userId: currentUser.id });
        }
        socket.leave(currentRoomId);
      }

      currentRoomId = roomId;
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
          canWrite = userPerm.canWrite;
          role = userPerm.role;
          // Carry a restriction across an in-place login so signing in cannot
          // be used to shed a host-revoked view-only state.
          if (!storedPerm) {
            room.userPermissions[actualUserId] = { canWrite, role };
            persistRoomAccess(room);
          }
        } else {
          canWrite = !room.isLocked;
          role = room.isLocked ? 'viewer' : 'editor';
          room.userPermissions[actualUserId] = { canWrite, role };
        }
      }

      const previousPresence = room.users[actualUserId];
      const previousSocketIds = previousPresence
        ? previousPresence.socketIds?.length
          ? previousPresence.socketIds
          : [previousPresence.socketId]
        : [];

      currentUser = {
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

      persistRoomAccess(room);
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
            targetSocket.leave(currentRoomId);
            targetSocket.disconnect(true);
          }
        }
      }

      delete room.users[targetUserId];

      io.to(currentRoomId).emit("user-kicked", {
        userId: targetUserId,
        userName: targetUser?.name || "Participant",
        reason: reason || "Removed by room administrator",
      });
      io.to(currentRoomId).emit("user-left", { userId: targetUserId });

      persistRoomAccess(room);
    });

    // Admin: Toggle Lock Whiteboard
    socket.on("admin-toggle-lock", (payload: { isLocked: boolean }) => {
      if (!currentRoomId || !currentUser || !currentUser.isHost) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.isLocked = payload.isLocked;

      // Update live participants and persisted permissions, including users who
      // are currently offline, so a restart/unlock does not leave stale viewers.
      const nextRole: 'editor' | 'viewer' = payload.isLocked ? 'viewer' : 'editor';
      const nextCanWrite = !payload.isLocked;
      Object.keys(room.userPermissions).forEach((userId) => {
        if (userId === room.creatorId) return;
        room.userPermissions[userId] = { canWrite: nextCanWrite, role: nextRole };
      });
      Object.values(room.users).forEach((u) => {
        if (!u.isHost) {
          u.canWrite = nextCanWrite;
          u.role = nextRole;
          room.userPermissions[u.id] = { canWrite: nextCanWrite, role: nextRole };
        }
      });

      io.to(currentRoomId).emit("room-lock-changed", {
        isLocked: room.isLocked,
        users: room.users,
      });

      persistRoomAccess(room);
    });

    // Admin: Delete Room
    socket.on("admin-delete-room", async (payload?: { roomId?: string }) => {
      const targetRoomId = payload?.roomId || currentRoomId;
      if (!targetRoomId || !currentUser) return;
      const room = rooms.get(targetRoomId);

      // Only the host of the room being deleted may delete it. Falls back to a
      // creator check for authenticated accounts that are not in the room.
      const isRoomHost = Boolean(currentRoomId === targetRoomId && currentUser.isHost);
      const meta = await getRoomMeta(targetRoomId);
      const creatorId = room?.creatorId || meta?.creatorId;
      const isCreator = Boolean(creatorId && creatorId === currentUser.id);

      if (!isRoomHost && !isCreator) {
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
        void saveRoomElements(targetRoomId, {});
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
          void saveRoomElements(targetRoomId, {});
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
      const totalEligible = userIds.length;

      // Broadcast updated votes
      io.to(currentRoomId).emit("vote-clear-updated", room.voteToClear);

      // If majority yes reached early
      if (yesCount > totalEligible / 2) {
        if (room.voteTimer) clearTimeout(room.voteTimer);
        room.elements = {};
        void saveRoomElements(currentRoomId, {});
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
      void saveRoomElements(currentRoomId, {});
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

      // Multiple tabs/sockets can share one account identity. Hand the presence
      // entry to a remaining socket instead of removing the user entirely.
      const presence = room.users[currentUser.id];
      if (presence) {
        const sockets = presence.socketIds?.length ? presence.socketIds : [presence.socketId];
        const remaining = sockets.filter((sid) => sid !== socket.id);
        if (remaining.length > 0) {
          presence.socketId = remaining[remaining.length - 1];
          presence.socketIds = remaining;
          return;
        }
      }

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

          void transferRoomOwnership(currentRoomId, nextHost.id, nextHost.name);
          persistRoomAccess(room);

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

      // Clean up empty rooms after 1 hour if no one is in them. Capture the id
      // now: the closure below outlives this socket, so `currentRoomId` may
      // already point at a different room by the time it runs.
      if (remainingUserIds.length === 0) {
        const roomIdToCleanup = currentRoomId;
        setTimeout(() => {
          const r = rooms.get(roomIdToCleanup);
          if (r && Object.keys(r.users).length === 0) {
            rooms.delete(roomIdToCleanup);
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
  const clientDistCandidates = [
    path.resolve(__dirname, "../../client/dist"),
    path.resolve(__dirname, "../client/dist"),
    path.resolve(process.cwd(), "client/dist"),
    path.resolve(process.cwd(), "../client/dist"),
  ];
  const clientDist = clientDistCandidates.find((dir) => fs.existsSync(dir));
  if (clientDist) {
    console.log(`[Static] Serving client production build from: ${clientDist}`);
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    console.warn("[Static] client/dist was not found. If this is a full-stack deployment, ensure client is built.");
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Collaborative Whiteboard server running on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}, flushing pending saves...`);
    try {
      await flushAllPendingSaves();
    } catch (err) {
      console.warn("[Shutdown] Failed to flush pending saves:", err);
    }
    io.close();
    server.close(() => process.exit(0));
    // Force-exit if connections refuse to close.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
