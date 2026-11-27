import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";

import { connectDb, checkDbHealth, disconnectDb, getRateLimitsCollection } from "./db";
import {
  MemoryRateLimitStore,
  DistributedRateLimitStore,
  createAuthRateLimiter,
} from "./authRateLimiter";
import { parseTrustProxy } from "./trustProxy";
import { flushAllPendingSaves } from "./auth";
import { buildAllowedOriginSet } from "./corsOrigins";
import { rooms, roomLifecycle, positiveEnvInt } from "./roomStore";
import { setupAuthRoutes } from "./routes/auth";
import { setupAiRoutes } from "./routes/ai";
import { setupRoomsRoutes } from "./routes/rooms";
import {
  registerSocketHandlers,
  joinSocketLimiter,
  joinIpLimiter,
  signalingLimiter,
} from "./sockets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables cleanly across root, server, and dist modes
const envCandidates = [
  path.resolve(process.cwd(), "server", ".env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "../.env"),
];
for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

// Last-resort logging. Socket handler errors are caught locally by `safeOn`;
// these listeners make any remaining async/fatal failure diagnosable.
process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught exception:", err);
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGIN_SET = buildAllowedOriginSet(process.env);

// Distributed rate limiter backed by MongoDB (with bounded in-memory fallback)
// so multi-process/clustered deployments share counters (#236).
const memoryRateLimitStore = new MemoryRateLimitStore(10_000);
const distributedRateLimitStore = new DistributedRateLimitStore(
  () => getRateLimitsCollection(),
  memoryRateLimitStore
);
const authRateLimiter = createAuthRateLimiter(distributedRateLimitStore);

// Periodic pruning of expired in-memory rate-limit records; unref'd so it
// never keeps the Node.js event loop alive during shutdown or tests.
const rateLimitPruneTimer = setInterval(() => {
  memoryRateLimitStore.prune();
  joinSocketLimiter.prune();
  joinIpLimiter.prune();
  signalingLimiter.prune();
}, 10 * 60 * 1000);
rateLimitPruneTimer.unref();

async function startServer() {
  await connectDb();
  const app = express();

  // Only a known proxy hop count may influence req.ip. Trusting `true` would
  // let clients forge the leftmost X-Forwarded-For and mint unlimited buckets
  // (#75); parseTrustProxy logs and ignores any unsupported value.
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy.warning) console.warn(`[Config] ${trustProxy.warning}`);
  if (trustProxy.hops !== null) app.set("trust proxy", trustProxy.hops);

  const server = http.createServer(app);
  server.requestTimeout = positiveEnvInt("HTTP_REQUEST_TIMEOUT_MS", 60000);
  server.headersTimeout = Math.max(
    server.requestTimeout + 5000,
    positiveEnvInt("HTTP_HEADERS_TIMEOUT_MS", 65000)
  );

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
    if (err instanceof SyntaxError && "status" in err && (err as any).status === 400) {
      res.status(400).json({ success: false, error: "Malformed JSON payload" });
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

  // Mount modular route handlers
  setupAuthRoutes(app, { authRateLimiter, allowedOriginSet: ALLOWED_ORIGIN_SET, port: PORT });
  setupAiRoutes(app, { authRateLimiter });
  setupRoomsRoutes(app, { io, authRateLimiter });

  // Mount real-time Socket.IO handlers
  registerSocketHandlers(io);

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
    roomLifecycle.clearAll();
    try {
      await flushAllPendingSaves();
    } catch (err) {
      console.warn("[Shutdown] Failed to flush pending saves:", err);
    }
    try {
      await disconnectDb();
    } catch (err) {
      console.warn("[Shutdown] Failed to disconnect database:", err);
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
