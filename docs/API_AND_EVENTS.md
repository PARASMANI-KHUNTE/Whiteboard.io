# REST API & Socket.IO Events Reference

This document provides a comprehensive specification of all backend REST endpoints and Socket.io event protocols used in **Whiteboard.io**.

---

## 1. REST API Endpoints

Base URL: `http://localhost:3000` (development) or `https://your-backend-service.onrender.com` (production).

All request and response payloads use `application/json`.

---

### System & Health

#### `GET /health` or `GET /api/health`
Checks server status, uptime, MongoDB database connectivity, latency, active rooms, and connected WebSocket clients.

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "uptimeSeconds": 1420,
  "timestamp": "2026-09-07T10:53:12.155Z",
  "activeRooms": 3,
  "services": {
    "database": {
      "status": "connected",
      "latencyMs": 4
    },
    "socketServer": {
      "status": "running",
      "connectedClients": 8
    }
  }
}
```

**Degraded Response (`503 Service Unavailable`):**
```json
{
  "status": "degraded",
  "uptimeSeconds": 1420,
  "timestamp": "2026-09-07T10:53:12.155Z",
  "activeRooms": 0,
  "services": {
    "database": {
      "status": "disconnected",
      "error": "connect ECONNREFUSED 127.0.0.1:27017"
    },
    "socketServer": {
      "status": "running",
      "connectedClients": 0
    }
  }
}
```

---

### Authentication

#### `POST /api/auth/register`
Registers a new user account.
* **Rate limit**: 15 requests / minute per IP.
* **Request Body**:
  ```json
  {
    "username": "artist_jane",
    "email": "jane@example.com",
    "password": "securePassword123",
    "name": "Jane Doe",
    "color": "#3b82f6"
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "u_7f8a9b",
      "username": "artist_jane",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "color": "#3b82f6",
      "isGuest": false
    },
    "token": "tok_9a8b7c6d5e4f3a2b1c"
  }
  ```

#### `POST /api/auth/login`
Authenticates with email or username.
* **Rate limit**: 15 requests / minute per IP.
* **Request Body**:
  ```json
  {
    "identifier": "jane@example.com",
    "password": "securePassword123"
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "user": { ... },
    "token": "tok_9a8b7c6d5e4f3a2b1c"
  }
  ```

#### `POST /api/auth/guest`
Creates or continues an anonymous guest identity.
* **Rate limit**: 30 requests / minute per IP.
* **Request Body**:
  ```json
  {
    "name": "Artist Fox",
    "color": "#10b981"
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "guest_abc123",
      "name": "Artist Fox",
      "color": "#10b981",
      "isGuest": true
    },
    "token": "tok_guest_token"
  }
  ```

#### `GET /api/auth/me`
Validates an active session token and returns the current user profile.
* **Headers**: `Authorization: Bearer <token>`
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "u_7f8a9b",
      "username": "artist_jane",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "color": "#3b82f6",
      "isGuest": false
    }
  }
  ```

#### `GET /api/auth/google/url`
Generates Google OAuth 2.0 authorization URL.
* **Query Parameters**: `?origin=https://your-frontend.com`
* **Response (`200 OK`)**:
  ```json
  {
    "configured": true,
    "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid+email+profile&state=...",
    "redirectUri": "https://your-backend.com/auth/google/callback"
  }
  ```

#### `GET /auth/google/callback`
Receives the authorization code from Google, exchanges it for an access token, fetches the user's profile, creates or links the MongoDB user account, and returns an HTML script that transmits the token to the parent window or redirects with `#auth_token=`.

---

### Room Management

#### `POST /api/rooms/create`
Creates a new persistent collaborative session room.
* **Headers**: `Authorization: Bearer <token>` (optional for guest hosts)
* **Request Body**:
  ```json
  {
    "name": "Design Sprint Board",
    "customCode": "SPRINT-2026",
    "isLocked": false
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "room": {
      "id": "SPRINT-2026",
      "name": "Design Sprint Board",
      "creatorId": "u_7f8a9b",
      "creatorName": "Jane Doe",
      "createdAt": 1725705600000,
      "isLocked": false
    }
  }
  ```

#### `GET /api/rooms/my-rooms`
Fetches all rooms created by the authenticated user.
* **Headers**: `Authorization: Bearer <token>`
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "rooms": [
      {
        "id": "SPRINT-2026",
        "name": "Design Sprint Board",
        "creatorId": "u_7f8a9b",
        "creatorName": "Jane Doe",
        "createdAt": 1725705600000,
        "isLocked": false
      }
    ]
  }
  ```

#### `GET /api/room/:roomId`
Returns status and metadata for a specific room.
* **Response (`200 OK`)**:
  ```json
  {
    "exists": true,
    "room": {
      "id": "SPRINT-2026",
      "name": "Design Sprint Board",
      "creatorId": "u_7f8a9b",
      "creatorName": "Jane Doe",
      "isLocked": false,
      "userCount": 4,
      "elementCount": 42
    }
  }
  ```

#### `DELETE /api/rooms/:roomId`
Permanently deletes a room and clears all persisted elements.
* **Headers**: `Authorization: Bearer <token>`
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "roomId": "SPRINT-2026"
  }
  ```

---

### AI Diagram Generation

#### `POST /api/ai/generate-diagram`
Generates structured canvas elements (shapes, sticky notes, directional connector arrows, text labels) using Google Gemini 2.5 Flash from natural language prompts. Protected by a 5-layer rate-limit shield, 2hr in-memory response caching, request pacing queue, and automatic procedural fallback.

* **Rate limit**: 10 requests / minute per IP address.
* **Request Body**:
  ```json
  {
    "prompt": "User Authentication & OAuth 2.0 Flow with JWT tokens",
    "style": "flowchart",
    "viewportCenter": {
      "x": 450,
      "y": 320
    }
  }
  ```
  * `prompt` (*string, required*): The natural language concept or architecture to visualize.
  * `style` (*string, optional*): One of `"mindmap"`, `"flowchart"`, `"brainstorm"`, `"architecture"`. Default is `"mindmap"`.
  * `viewportCenter` (*object, optional*): Canvas world coordinates `{ x: number, y: number }` indicating where to center the generated diagram.
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "elements": [
      {
        "id": "ai-geom-1725705601234-0",
        "type": "shape",
        "shapeType": "roundrect",
        "x": 350,
        "y": 120,
        "width": 200,
        "height": 60,
        "fillColor": "#3b82f6",
        "strokeColor": "#1d4ed8",
        "strokeWidth": 2,
        "text": "Start: User Visits Site",
        "textColor": "#ffffff",
        "fontSize": 15
      },
      {
        "id": "ai-geom-1725705601234-1",
        "type": "shape",
        "shapeType": "arrow",
        "x": 450,
        "y": 180,
        "width": 40,
        "height": 60,
        "strokeColor": "#64748b",
        "strokeWidth": 2
      }
    ],
    "cached": false,
    "fallback": false,
    "count": 8
  }
  ```
* **Error Responses**:
  * `400 Bad Request`: When `prompt` is missing, empty, or not a string.
  * `500 Internal Server Error`: Critical generation failure (procedural fallback ensures this is exceptionally rare).

---

## 2. Socket.io Real-Time Protocol

Clients establish a connection to `/socket.io/` using WebSocket or HTTP long-polling fallback.

---

### Client Emitters (Client ➔ Server)

| Event Name | Payload | Description |
| :--- | :--- | :--- |
| `join-room` | `{ roomId, user, token }` | Joins a room, validates credentials, and initializes state. |
| `stroke-live-start` | `{ strokeId, point, color, size, isHighlighter }` | Starts streaming a live pen stroke. |
| `stroke-live-point` | `{ strokeId, point }` | Streams an incremental coordinate point. |
| `element-create` | `CanvasElement` | Finalizes a single completed element (stroke, shape, sticky, text, icon). |
| `elements-batch-create` | `{ elements: CanvasElement[] }` | Atomically adds and broadcasts an array of elements (used by AI Diagram Generator). |
| `element-update` | `CanvasElement` | Updates coordinates, dimensions, content, or styling of an element. |
| `element-delete` | `{ elementId }` | Deletes a single canvas element. |
| `elements-batch-delete` | `{ elementIds: string[] }` | Deletes multiple elements simultaneously. |
| `cursor-move` | `{ x, y, tool, isDrawing }` | Broadcasts current mouse pointer coordinates and active tool. |
| `audio-level` | `{ level, isSpeaking }` | Transmits microphone volume level (0-1) for speech indicators. |
| `voice-status-update` | `{ isMuted, isDeafened, voiceConnected }` | Synchronizes mute/deafen status across participants. |
| `voice-offer` | `{ toUserId, offer }` | WebRTC SDP offer sent to initiate peer audio. |
| `voice-answer` | `{ toUserId, answer }` | WebRTC SDP answer responding to an offer. |
| `voice-ice-candidate` | `{ toUserId, candidate }` | WebRTC ICE candidate exchange for NAT traversal. |
| `vote-clear-start` | *None* | Initiates a consensus vote to clear the whiteboard. |
| `vote-clear-cast` | `{ vote: boolean }` | Casts a YES or NO vote. |
| `vote-clear-cancel` | *None* | Cancels the active clear vote (initiator only). |
| `clear-board-direct` | *None* | Instantly wipes the whiteboard (solo mode or host action). |
| `admin-set-permission` | `{ targetUserId, canWrite }` | Grants or revokes participant drawing privileges. |
| `admin-kick-user` | `{ targetUserId, reason }` | Ejects a participant from the room. |
| `admin-toggle-lock` | `{ isLocked }` | Locks whiteboard into read-only mode for non-hosts. |
| `admin-delete-room` | `{ roomId }` | Destroys room, kicks all users, and purges database state. |

---

### Server Listeners (Server ➔ Client)

| Event Name | Payload | Description |
| :--- | :--- | :--- |
| `room-init` | `{ roomId, roomName, elements, users, voteToClear, yourRole, canWrite, isHost, isLocked }` | Initial synchronization payload sent upon joining. |
| `user-joined` | `RemoteUser` | Emitted when a new user joins the room. |
| `user-left` | `{ userId }` | Emitted when a user disconnects or leaves. |
| `stroke-live-started` | `{ userId, strokeId, point, color, size, isHighlighter }` | Real-time stroke starting by another participant. |
| `stroke-live-pointed` | `{ strokeId, point }` | Incoming coordinate point for an active stroke. |
| `element-created` | `CanvasElement` | A new persistent element has been added to the board. |
| `elements-batch-created` | `{ elements: CanvasElement[] }` | Multiple elements created and added simultaneously to the board. |
| `element-updated` | `CanvasElement` | An existing element has been edited, moved, or resized. |
| `element-deleted` | `{ elementId }` | An element has been removed from the canvas. |
| `elements-batch-deleted` | `{ elementIds }` | Multiple elements removed in batch. |
| `cursor-moved` | `{ userId, cursor: { x, y, tool, isDrawing } }` | Updates remote multiplayer cursor position. |
| `audio-level-updated` | `{ userId, level, isSpeaking }` | Triggers the green speaking ring around user cursors. |
| `voice-status-updated` | `{ userId, isMuted, isDeafened, voiceConnected }` | Updates participant mic/deafen badges. |
| `permission-updated` | `{ canWrite, role, message }` | Sent specifically to a user when their permissions change. |
| `user-permission-changed` | `{ userId, canWrite, role }` | Broadcast to room so participant lists reflect current roles. |
| `room-lock-changed` | `{ isLocked, users }` | Notifies users that the board was locked/unlocked. |
| `room-host-migrated` | `{ newHostId, newHostName, message }` | Automatic host election when original host departs. |
| `user-kicked` | `{ userId, userName, reason }` | Broadcast notification that a participant was ejected. |
| `kicked` | `{ reason }` | Sent directly to the client being kicked before disconnecting. |
| `room-deleted` | `{ roomId, message }` | Disconnects all users when host deletes the room. |
| `vote-clear-started` | `VoteToClearState` | Opens the 15-second countdown vote modal. |
| `vote-clear-updated` | `VoteToClearState` | Live progress of current votes tally. |
| `vote-clear-ended` | `{ passed, yesCount, totalEligible, reason }` | Concludes vote and announces result. |
| `board-cleared` | `{ initiatorName, wasVoted }` | Clears all canvas elements from local memory. |
| `permission-denied` | `{ message }` | Warns client when attempting a restricted operation. |
