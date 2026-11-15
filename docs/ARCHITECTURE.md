# System Architecture & Technical Design

This document details the architectural design, communication protocols, data models, and real-time synchronization pipelines of **Whiteboard.io**.

---

## 1. High-Level Architecture Overview

Whiteboard.io is built as a real-time, distributed collaborative workspace consisting of a high-performance React client and an event-driven Node.js/Express backend connected to MongoDB.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT BROWSER                                  │
│                                                                             │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────┐  │
│  │   Canvas 2D Engine    │   │  React State / Hooks  │   │ Web Audio    │  │
│  │  (Strokes, Shapes,    │◄──┤ (useSocket, useAuth,  ├───┤ AnalyserNode │  │
│  │   Sticky Notes, Text) │   │     useVoiceChat)     │   │ (Microphone) │  │
│  └───────────────────────┘   └───────────┬───────────┘   └──────────────┘  │
└──────────────────────────────────────────┼──────────────────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
             HTTP / REST (JSON)                    WebSocket (Socket.io)
        - Auth (Register/Login/Guest)         - Real-time Drawing Sync
        - Google OAuth Popups/Redirect        - Multiplayer Live Cursors
        - Room Metadata & Management          - WebRTC Mesh Audio Signaling
        - Health & Database Telemetry         - Admin Permissions & Kick
                        │                     - Vote-to-Clear Consensus
                        ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND SERVER (Node.js)                         │
│                                                                             │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │     Express REST API Router     │   │     Socket.io Event Gateway     │  │
│  │  (CORS, Rate Limiting, Health)  │   │   (Room isolation, Auth guard)  │  │
│  └────────────────┬────────────────┘   └────────────────┬────────────────┘  │
│                   │                                     │                   │
│                   └──────────────────┬──────────────────┘                   │
│                                      ▼                                      │
│                        ┌───────────────────────────┐                        │
│                        │ In-Memory Room State Map  │                        │
│                        │ (Live users, active vote, │                        │
│                        │  in-memory elements cache)│                        │
│                        └─────────────┬─────────────┘                        │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                      Debounced Persist & Sync Queries
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               MONGODB DATABASE                              │
│                                                                             │
│    - users: Credentials, salt, hash, Google profile, owned room IDs         │
│    - tokens: SHA-256 session tokens with TTL expiration index               │
│    - rooms: Room metadata, host identity, locked status                     │
│    - elements: Batch-persisted canvas elements (strokes, sticky, shapes)    │
│    - room_elements: Granular atomic document per element index              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Real-Time Synchronization Engine

### In-Memory State & Conflict Resolution
The server maintains an in-memory `Map<string, RoomData>` storing:
- Active participants, roles (`admin`, `editor`, `viewer`), and write permissions.
- Element dictionary: `Record<string, CanvasElement>` keyed by unique element UUIDs.
- Active consensus vote timers for clearing the board.

### Optimistic UI & Live Stroke Streaming
Drawing strokes in collaborative apps require zero perceived latency:
1. **Local Optimistic Draw**: As the user drags the mouse/stylus, points are immediately rendered to the local canvas.
2. **Live Point Streaming**: At regular intervals during pointer movement, lightweight `stroke-live-point` packets are emitted over WebSockets so remote users see strokes appearing point-by-point in real time.
3. **Element Finalization**: On pointer release (`pointerup`), the completed `CanvasElement` is finalized and broadcast via `element-create`. The temporary live stroke points are cleaned up and replaced by the authoritative element.

### Debounced Database Persistence
To prevent MongoDB write bottlenecks during high-frequency drawing:
- Incoming element modifications are applied immediately to the in-memory room map.
- A debounce timer (500ms) accumulates changes before writing the aggregated canvas state to MongoDB.
- Direct board deletions or batch deletes trigger immediate database synchronization.

---

## 3. WebRTC Peer-to-Peer Voice Chat Mesh

Audio communication runs over a decentralized **WebRTC Mesh Network**:
- **Signaling via Socket.io**: Peers exchange `voice-offer`, `voice-answer`, and `voice-ice-candidate` messages routed through the Socket.io room.
- **Direct P2P Audio Streams**: Once ICE negotiation succeeds, peer audio flows directly between browser sessions with sub-50ms latency.
- **Audio Reactivity & Visualizer**:
  - The browser's `AudioContext` and `AnalyserNode` analyze local microphone frequencies.
  - An RMS volume calculation detects active speech and emits `audio-level` updates so remote cursors display an animated speaking halo.
- **NAT / Firewall Traversal**:
  - Google's public STUN servers are configured by default.
  - Custom STUN and TURN credentials can be injected via `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_PASSWORD`.

---

## 4. Security & Authentication Architecture

### Identity Models
The application supports three authentication tiers:
1. **Registered Account**: Username, email, password hashed with `crypto.pbkdf2Sync` (10,000 iterations, 64-byte salt, sha512).
2. **Google OAuth 2.0**: Direct federated authentication using Google's OAuth 2.0 UserInfo endpoint. Supports popup messaging and cross-domain redirect fallback via `#auth_token=`.
3. **Anonymous Guest Session**: Instant ephemeral guest account with animal-themed names and color assignments. Guest sessions expire automatically after 7 days via MongoDB TTL indexes.

### Security Layers
- **Rate Limiting**: Custom token-bucket rate limiter for auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/guest`) protecting against brute-force attacks.
- **Security Headers**: Explicit enforcement of `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection`.
- **CORS Allowlist**: Dynamic origin resolution honoring `APP_URL`, `CLIENT_URL`, and local dev origins.
- **Input Sanitization**: Malformed JSON guards and HTML escaping on OAuth callback error responses.

---

## 5. MongoDB Data Schemas & Indexes

All MongoDB collections are automatically initialized with optimized compound indexes:

### `users` Collection
Stores registered and Google-linked accounts.
```typescript
interface StoredUserDoc {
  id: string;              // Unique UUID (Index: unique)
  username: string;        // Indexed for lookup
  email: string;           // Indexed for lookup
  passwordHash: string;
  salt: string;
  name: string;
  color: string;
  createdAt: number;
  createdRooms: string[];  // List of room codes owned by user
  isGuest?: boolean;       // TTL index: 7 days for guests
  googleId?: string;
  picture?: string;
}
```

### `tokens` Collection
Session authentication tokens.
```typescript
interface SessionTokenDoc {
  token: string;           // SHA-256 token string (Index: unique)
  userId: string;          // Indexed for user session queries
  createdAt: number;       // TTL index: auto-expires after 30 days
  updatedAt: number;
}
```

### `rooms` Collection
Persisted session room metadata.
```typescript
interface SessionRoomDoc {
  id: string;              // Room code (e.g., 'ABC-XYZ') (Index: unique)
  name: string;
  creatorId: string;       // Indexed for "My Rooms" dashboard query
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
}
```

### `elements` Collection
Aggregated room canvas elements.
```typescript
interface RoomElementsDoc {
  roomId: string;          // Room ID (Index: unique)
  elements: Record<string, CanvasElement>;
  updatedAt: number;
}
```

---

## 6. AI Diagram Engine (Gemini or Local Ollama) & 5-Layer Rate-Limit Shield

Whiteboard.io includes an integrated AI diagram generation pipeline (`server/ai/`). The default cloud engine is **Google Gemini 3.8 Flash**, and the same pipeline can run fully offline against a local **Ollama** model. `server/ai/providers.ts` resolves the active engine from the environment (`AI_PROVIDER`, `GEMINI_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`), exposes it at `GET /api/ai/config`, and dispatches structured-output calls to either backend. Users can describe ideas in plain English and automatically receive fully styled, interactive canvas elements (mind maps, flowcharts, Kanban/SWOT boards, and architecture diagrams) with real connectors and labelled branches.

Each AI turn walks a **failover chain** rather than a single model: `GEMINI_MODEL` → `GEMINI_FALLBACK_MODELS` (default `gemini-3.6-flash`) → Ollama in `auto` mode. A `503 UNAVAILABLE` or timeout on the preferred model therefore continues with the next real model instead of degrading to the procedural generator. Chain candidates are attempted once each so an upstream spike resolves in seconds; the payload reports the backend that actually answered and attaches a notice naming the skipped engines. The same chain drives both generation and `POST /api/ai/revise-diagram`.


The model returns a semantic **graph** (nodes + edges), not coordinates. The server normalizes it, runs a quality gate (with one retry when output is too sparse or disconnected), then computes layout (layered DAG, architecture lanes, radial mind map, or brainstorm columns) and emits real `ShapeElement`/`StickyNote`/`WireElement` objects. A stateless `POST /api/ai/revise-diagram` endpoint accepts the current graph plus an instruction and returns the complete revised graph, which the client diffs against the session's `ai_<sessionId>_` elements and applies as a single undo step. Both backends return JSON constrained by the shared `GRAPH_RESPONSE_SCHEMA` (Gemini `responseSchema`, Ollama `format`).

### AI Generation Flow

```
┌─────────────────┐       POST /api/ai/generate-diagram       ┌────────────────────────┐
│  Client Browser │ ─────────────────────────────────────────►│  Express REST Handler  │
│ (AiGenerateModal│◄───────────────────────────────────────── │  (10 req/min IP limit) │
└────────┬────────┘      JSON CanvasElement[] Batch           └───────────┬────────────┘
         │                                                                │
         │ emitElementsBatchCreate                                        ▼
         ▼                                                    ┌────────────────────────┐
┌─────────────────┐                                           │  In-Memory 2hr Cache   │
│ Socket.io Relay │                                           │ (Matches prompt+style) │
│ (Room broadcast)│                                           └───────────┬────────────┘
└────────┬────────┘                                                       │ (Cache miss)
         │                                                                ▼
         ▼                                                    ┌────────────────────────┐
┌─────────────────┐                                           │ Outbound Request Queue │
│ All Peers in    │                                           │ (Enforces 3000ms delay)│
│ Collaborative   │                                           └───────────┬────────────┘
│ Room Viewport   │                                                       │
└─────────────────┘                                                       ▼
                                                              ┌────────────────────────┐
                                                              │ Engine Dispatch        │
                                                              │ Gemini / Ollama        │
                                                              │ (Exponential Backoff)  │
                                                              └───────────┬────────────┘
                                                                          │ (If offline / 429)
                                                                          ▼
                                                              ┌────────────────────────┐
                                                              │  Procedural Fallback   │
                                                              │   Synthesis Engine     │
                                                              └────────────────────────┘
```

### 5-Layer Rate-Limit Shield Architecture

Google Gemini's free tier has strict concurrency and Requests-Per-Minute (RPM) limits (~15 RPM). To prevent rate limit exhaustion (`HTTP 429 Resource Exhausted`) and guarantee 100% uptime for collaborative sessions, the backend implements a **5-layer defensive shield**:

| Layer | Mechanism | Implementation Detail |
| :--- | :--- | :--- |
| **Layer 1: IP Rate Limiting** | Express In-Memory Token Limiter | Restricts clients to a maximum of **10 AI diagram requests per minute per IP address** (`server/index.ts`). |
| **Layer 2: Response Caching** | Normalizing In-Memory Cache (2hr TTL) | Caches generated graphs using a normalized key `schema|provider|model|type|detail|direction|lowercase_prompt`. Repeated prompts (e.g. popular templates) return immediately in **<1ms** with zero model calls. |
| **Layer 3: Request Pacing Queue** | Serial FIFO Promise Queue | Queues all outbound calls to the active engine and enforces an inter-call spacing window — **3000ms** for Gemini, `OLLAMA_MIN_INTERVAL_MS` (default 250ms) for local Ollama. This prevents simultaneous users from triggering burst spikes. |
| **Layer 4: Exponential Backoff & Retry** | Jittered Retry Loop | If Gemini returns `429 Too Many Requests` or `503 Service Unavailable`, the queue automatically pauses and retries up to 3 times with exponential backoff (`1500ms`, `3000ms`, `6000ms`). Local Ollama calls use a single attempt with a long `OLLAMA_TIMEOUT_MS` (default 180s) to absorb model loading. |
| **Layer 5: Procedural Fallback Engine** | Offline Algorithmic Diagram Synthesis | If no engine is configured, if retries are exhausted, or if the model backend is down, the system transparently falls back to a deterministic procedural generator. The user always receives a clean, connected diagram without any application error. |

### Diagram Synthesis Styles & Structured Output
The generator maps natural language into specific graph topologies:
- **Mind Map (`mindmap`)**: Radial tree layout with a central topic node, colored primary branches, and secondary sub-topic nodes with directional arrows.
- **Flowchart (`flowchart`)**: Sequential top-down or left-to-right DAG with start/end terminals, process rectangles, decision diamonds, and labeled connectors.
- **Sticky Board (`brainstorm`)**: Kanban/SWOT matrix with themed column headers and color-coded sticky notes organized in a 2D grid.
- **System Architecture (`architecture`)**: Layered architectural schematic depicting client tiers, API gateways, microservices, messaging queues, and databases with interconnecting bus lines.
