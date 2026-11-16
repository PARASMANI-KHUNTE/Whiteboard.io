# System Architecture & Technical Design

This document details the architectural design, communication protocols, data models, persistence layers, and real-time synchronization pipelines of **Whiteboard.io**.

> [!TIP]
> **Live Production Deployment**: [https://whiteboard-io-1.onrender.com/](https://whiteboard-io-1.onrender.com/)
> **Formal Project Report**: The comprehensive Master's project report is available in [docs/Generated_Project_Report.docx](Generated_Project_Report.docx).

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
│  │   Wires, Sticky, Text)│   │  useVoiceChat, Theme) │   │ (Microphone) │  │
│  └───────────▲───────────┘   └───────────┬───────────┘   └──────────────┘  │
│              │                           │                                 │
│  ┌───────────┴───────────┐   ┌───────────┴───────────┐                     │
│  │  Spatial Index (2D)   │   │  Client Persistence   │                     │
│  │  (AABB Viewport Cull, │   │ (soloStorage, recents,│                     │
│  │   Hit/Select Tests)   │   │  guestId, aiSessions) │                     │
│  └───────────────────────┘   └───────────────────────┘                     │
└──────────────────────────────────────────┼──────────────────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
             HTTP / REST (JSON)                    WebSocket (Socket.io)
        - Auth (Register/Login/Guest)         - Real-time Drawing & Wire Sync
        - Google OAuth Popups/Redirect        - Multiplayer Live Cursors
        - Room Metadata & Recent Rooms        - WebRTC Mesh Audio Signaling
        - AI Config, Generate & Revise        - Admin Governance & Lock
        - Health & Database Telemetry         - Vote-to-Clear Consensus
                        │                                     │
                        ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND SERVER (Node.js)                         │
│                                                                             │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │     Express REST API Router     │   │     Socket.io Event Gateway     │  │
│  │  (CORS, Rate Limiting, Health)  │   │   (Room isolation, Auth guard)  │  │
│  └────────────────┬────────────────┘   └────────────────┬────────────────┘  │
│                   │                                     │                   │
│                   ├─────────────────────────────────────┤                   │
│                   ▼                                     ▼                   │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │      AI Engine Pipeline         │   │    In-Memory Room State Map     │  │
│  │ (Failover Chain: Gemini 3.8/3.6 │   │ (Live users, active vote,       │  │
│  │  -> Ollama -> Procedural, Gate, │   │  in-memory elements dictionary) │  │
│  │  Layout Engines & Revise API)   │   └────────────────┬────────────────┘  │
│  └─────────────────────────────────┘                    │                   │
└─────────────────────────────────────────────────────────┼───────────────────┘
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

## 2. Real-Time Synchronization & Performance Engine

### In-Memory State & Conflict Resolution
The server maintains an in-memory `Map<string, RoomData>` storing:
- Active participants, roles (`admin`, `editor`, `viewer`), and write permissions.
- Element dictionary: `Record<string, CanvasElement>` keyed by unique element UUIDs.
- Active consensus vote timers for clearing the board.

### Optimistic UI & Live Stroke Streaming
Drawing strokes in collaborative apps require zero perceived latency:
1. **Local Optimistic Draw**: As the user drags the mouse/stylus, points are immediately rendered to the local canvas.
2. **Live Point Streaming**: Lightweight `stroke-live-point` packets are emitted over WebSockets so remote users see strokes appearing point-by-point in real time.
3. **Element Finalization & RDP Simplification**: On pointer release (`pointerup`), strokes are simplified using the Ramer-Douglas-Peucker algorithm to remove redundant collinear points, finalized as a `CanvasElement`, and broadcast via `element-create`.

### 2D Spatial Indexing
To keep rendering and selection fast ($O(\log N + K)$) when a board contains thousands of elements:
- A 2D spatial grid partitions world space into uniform cells.
- Elements are indexed by axis-aligned bounding boxes (AABBs).
- The canvas engine only iterates through and renders elements within the active camera frustum.
- Hit detection, lasso selection, and eraser collisions query the spatial index directly rather than executing linear full-canvas scans.

### Debounced Database Persistence
To prevent database write bottlenecks during high-frequency drawing:
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

## 4. Multi-Tier Persistence & Identity Continuity

Whiteboard.io provides end-to-end data durability across cloud and local storage:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE ARCHITECTURE                          │
│                                                                             │
│  Multiplayer Cloud Storage (MongoDB)     Solo & Client Local Storage        │
│  ┌──────────────────────────────────┐   ┌────────────────────────────────┐  │
│  │ • users, tokens (TTL 30d)        │   │ • soloStorage.ts (Autosave)    │  │
│  │ • rooms, elements, room_elements │   │ • guestIdentity.ts (UUID/Name) │  │
│  │ • Native connection pool & retry │   │ • recentRooms.ts (LRU history) │  │
│  │ • In-memory fallback if no Mongo │   │ • aiSessionStorage.ts (Chat)   │  │
│  └──────────────────────────────────┘   └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Multiplayer Rooms (MongoDB)**:
   - Handled via `server/db.ts` with connection pooling and automated index creation.
   - Degrades gracefully to in-memory store if `MONGODB_URI` is absent (for lightweight testing or offline development).
2. **Solo Whiteboard Storage (`soloStorage.ts`)**:
   - Autosaves offline canvas work directly to browser `localStorage` with a 300ms debounce.
   - Restores user work upon page reload without requiring room creation.
3. **Guest Identity Persistence (`guestIdentity.ts`)**:
   - Assigns a stable UUID, animal handle, and color to guest users.
   - Persists in `localStorage` so users maintain the same identity when switching between rooms.
4. **Recent Rooms Tracker (`recentRooms.ts`)**:
   - Tracks visited room IDs, timestamps, and metadata to provide a 1-click room launcher.
5. **AI Session Memory (`aiSessionStorage.ts`)**:
   - Stores per-room diagram revision conversations and generated graphs across browser reloads.

---

## 5. Security & Authentication Architecture

### Identity Models
1. **Registered Account**: Username, email, password hashed with `crypto.pbkdf2Sync` (10,000 iterations, 64-byte salt, sha512).
2. **Google OAuth 2.0**: Direct federated authentication using Google's OAuth 2.0 UserInfo endpoint. Supports popup messaging and cross-domain redirect fallback via `#auth_token=`.
3. **Anonymous Guest Session**: Instant ephemeral guest account with animal-themed names and color assignments. Guest sessions expire automatically after 7 days via MongoDB TTL indexes.

### Security Layers
- **Rate Limiting**: Custom token-bucket rate limiter for auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/guest`) and AI endpoints (`/api/ai/generate-diagram`, `/api/ai/revise-diagram`).
- **Security Headers**: Explicit enforcement of `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection`.
- **CORS Allowlist**: Dynamic origin resolution honoring `APP_URL`, `CLIENT_URL`, and local dev origins.
- **Input Sanitization**: Malformed JSON guards, character length truncations (prompt: 1200 chars), and HTML escaping on OAuth callback error responses.

---

## 6. MongoDB Data Schemas & Indexes

All MongoDB collections are automatically initialized with compound indexes:

### `users` Collection
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
```typescript
interface SessionTokenDoc {
  token: string;           // SHA-256 token string (Index: unique)
  userId: string;          // Indexed for user session queries
  createdAt: number;       // TTL index: auto-expires after 30 days
  updatedAt: number;
}
```

### `rooms` Collection
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
```typescript
interface RoomElementsDoc {
  roomId: string;          // Room ID (Index: unique)
  elements: Record<string, CanvasElement>;
  updatedAt: number;
}
```

---

## 7. AI Diagram Engine & Model Failover Pipeline

Whiteboard.io includes an enterprise-grade AI diagram synthesis pipeline (`server/ai/`):

```
┌─────────────────┐       POST /api/ai/generate-diagram       ┌────────────────────────┐
│  Client Browser │ ─────────────────────────────────────────►│  Express REST Handler  │
│ (AiGenerateModal│◄───────────────────────────────────────── │  (10 req/min IP limit) │
│  or AiChatPanel)│      JSON CanvasElement[] Batch           └───────────┬────────────┘
└────────┬────────┘                                                       │
         │                                                                ▼
         │ emitElementsBatchCreate                                    ┌────────────────────────┐
         ▼                                                            │  In-Memory 2hr Cache   │
┌─────────────────┐                                                   │ (Matches prompt+style) │
│ Socket.io Relay │                                                   └───────────┬────────────┘
│ (Room broadcast)│                                                               │ (Cache miss)
└────────┬────────┘                                                               ▼
         │                                                            ┌────────────────────────┐
         ▼                                                            │ Outbound Request Queue │
┌─────────────────┐                                                   │ (Enforces 3000ms delay)│
│ All Peers in    │                                                   └───────────┬────────────┘
│ Collaborative   │                                                               │
│ Room Viewport   │                                                               ▼
└─────────────────┘                                                   ┌────────────────────────┐
                                                                      │ AI Model Failover Chain│
                                                                      │ Gemini 3.8 Flash       │
                                                                      │   ▼ (on timeout / 503) │
                                                                      │ Gemini 3.6 Flash       │
                                                                      │   ▼ (on failure)       │
                                                                      │ Local Ollama (llama3.2)│
                                                                      └───────────┬────────────┘
                                                                                  │ (If all fail)
                                                                                  ▼
                                                                      ┌────────────────────────┐
                                                                      │  Procedural Fallback   │
                                                                      │   Synthesis Engine     │
                                                                      └────────────────────────┘
```

### AI Model Failover Chain
An AI turn walks an ordered chain of backends:
- `GEMINI_MODEL` (default: `gemini-3.8-flash`)
- `GEMINI_FALLBACK_MODELS` (default: `gemini-3.6-flash`)
- Local **Ollama** model (`llama3.2` at `http://127.0.0.1:11434`)
- Offline **Procedural Engine** (deterministic diagram synthesis)

If a Gemini model suffers a `503 Service Unavailable` or transient timeout, the request immediately fails over to the next candidate model instead of failing the user or degrading to offline shapes. The payload reports which model actually answered and attaches a user-facing notice.

### Semantic Graph Representation & Quality Gate
1. The AI model returns an abstract semantic graph constrained by JSON Schema:
   - `nodes`: Unique ID, human label, category (`service`, `database`, `step`, `concept`, etc.), and role description.
   - `edges`: Source ID, target ID, relationship label, and optional style.
2. **Quality Gate**: The graph is inspected for node counts and edge connectivity. If the output is sparse or disconnected, a targeted 1-turn retry is automatically executed.
3. **Layout Engines (`server/ai/layout.ts`)**:
   - Layered Sugiyama DAG layout for flowcharts.
   - Radial hub-and-spoke tree layout for mind maps.
   - Column grid layout for brainstorm / Kanban boards.
   - Swimlane tiered layout for cloud and system architecture diagrams.
4. **Smart Connector Generation (`server/ai/elements.ts`)**:
   - Shapes are emitted with anchor snapping.
   - Relational `wire` elements with cubic Bézier routing connect shapes seamlessly.

### Conversational Diagram Revision (`/api/ai/revise-diagram`)
The server supports interactive diagram editing:
- Client transmits current graph structure, conversation history, and new natural language instructions.
- The AI model computes additions, modifications, and deletions.
- Client applies differential updates atomically as an undo/redo checkpoint on the whiteboard.
