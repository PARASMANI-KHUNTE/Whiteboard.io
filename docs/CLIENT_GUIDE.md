# Client Architecture & Component Guide

This guide details the internal frontend architecture, state management hooks, canvas rendering pipeline, persistence utilities, and component hierarchy of **Whiteboard.io**.

> [!TIP]
> **Live Production Deployment**: [https://whiteboard-io-1.onrender.com/](https://whiteboard-io-1.onrender.com/)

---

## 1. Component Hierarchy & Layout

The frontend is organized into modular React components centered around an infinite 2D canvas:

```
App.tsx
├── Header.tsx (Room status, users dropdown, voice toggle, auth buttons, theme toggle, ✨ AI Diagram button, 💬 AI Chat toggle, ℹ️ About modal, ⌨️ Shortcuts modal)
│   ├── AudioVisualizerBar.tsx (Waveform rendering & mic controls)
│   ├── AdminPanelModal.tsx (Host room lock, user permissions, kick user)
│   ├── AboutModal.tsx (App mission, key differentiators, and feature comparison matrix)
│   ├── ShortcutsModal.tsx (Keyboard shortcuts cheat sheet overlay)
│   └── SessionLauncherModal.tsx (Recent rooms dashboard, new room creation, solo mode selector)
├── Toolbar.tsx (Drawing tools, shapes, sticky notes, text, icons, wires/connectors, colors, stroke width)
├── Canvas.tsx (Interactive drawing surface, coordinate transformation, remote cursors, spatial indexing)
│   ├── ShapeItem.tsx (Rectangles, circles, diamonds, triangles, stars, arrows)
│   ├── StickyNoteItem.tsx (Draggable colored sticky notes with inline editing)
│   ├── TextItem.tsx (Rich text nodes with font styling and resizing)
│   ├── IconItem.tsx (Lucide SVG icons with color/rotation transforms)
│   ├── WireItem.tsx (Smart relational connectors with cubic Bézier curve paths & arrowheads)
│   └── ContextMenu.tsx (Right-click quick actions: duplicate, bring to front, send to back, delete)
├── ZoomControls.tsx (Zoom in/out, pan reset, zoom-to-fit)
├── AuthModal.tsx (Login, registration, guest onboarding, Google sign-in)
├── CreateRoomModal.tsx (Room code generator, room naming, private lock, recent room tags)
├── ShareRoomModal.tsx (Shareable link, QR code, room code copy)
├── VoteToClearModal.tsx (Interactive voting modal with live consensus progress)
├── ConfirmModal.tsx (Modal confirmation dialog for destructive actions)
├── AiGenerateModal.tsx (Natural language diagram generation modal: style, detail, direction, live backend engine badge)
└── AiChatPanel.tsx (Slide-out conversational drawer for diagram revisions, follow-up refinements, and turn history)
```

---

## 2. Core Custom Hooks

### 1. `useSocket(roomId, authUser, authToken)`
Located in [`../client/src/hooks/useSocket.ts`](../client/src/hooks/useSocket.ts).
- Manages the primary Socket.io connection to `BACKEND_URL`.
- Exposes real-time state:
  - `elements`: Key-value map of canvas elements (`Record<string, CanvasElement>`).
  - `users`: Map of active remote participants with cursors and speaking flags.
  - `liveStrokes`: In-flight drawing stroke points before completion.
  - `voteToClear`: Active vote timer and participant vote tallies.
  - `canWrite`: Boolean indicating whether the local user has write permissions.
  - `isHost`: Boolean indicating whether the local user is room administrator.
  - `isLocked`: Boolean indicating if room is currently locked by the host.
- Provides unified emission functions:
  - `emitElementCreate`, `emitElementsBatchCreate`, `emitElementUpdate`, `emitElementDelete`, `emitElementsBatchDelete`.
  - `emitCursorMove`, `emitAudioLevel`, `setParticipantPermission`, `kickParticipant`, `toggleRoomLock`.
- Listens for `elements-batch-created` and `elements-batch-deleted` to atomically render complex multi-element diagrams without overloading network buffers.

### 2. `useAuth()`
Located in [`../client/src/hooks/useAuth.ts`](../client/src/hooks/useAuth.ts).
- Manages user identity and opaque server-issued bearer token persistence in `localStorage`.
- Supports:
  - Account registration and login via `/api/auth/*`.
  - Ephemeral guest creation via `/api/auth/guest` with seamless identity recovery (`guestIdentity.ts`).
  - Google OAuth popup flow with `postMessage` listener and URL hash redirect fallback (`#auth_token=`).
  - Room querying via `/api/rooms/my-rooms`.

### 3. `useVoiceChat({ socket, currentUser, roomId, users })`
Located in [`../client/src/hooks/useVoiceChat.ts`](../client/src/hooks/useVoiceChat.ts).
- Initializes Web Audio API `AudioContext` and `AnalyserNode`.
- Captures microphone input (`navigator.mediaDevices.getUserMedia`).
- Detects vocal speech using volume thresholding and broadcasts real-time `audio-level` packets.
- Establishes peer-to-peer `RTCPeerConnection` mesh connections with remote participants.
- Handles audio track streaming, muting, deafening, and fallback simulated audio bars when mic access is blocked by browser policies.

### 4. `useTheme()`
Located in [`../client/src/hooks/useTheme.ts`](../client/src/hooks/useTheme.ts).
- Toggles dark mode and light mode across the application.
- Syncs state with `localStorage` and applies the `dark` class to the root HTML document.

---

## 3. Canvas Rendering & Performance Engine

### Coordinate Space Transformation
The whiteboard uses a dynamic camera transform model to support infinite panning and zooming:
- **Screen Space**: Raw browser mouse/touch event coordinates (`e.clientX`, `e.clientY`).
- **World Space**: The infinite canvas coordinate system.
- Transform calculation:
  ```typescript
  const worldX = (screenX - panOffset.x) / zoomLevel;
  const worldY = (screenY - panOffset.y) / zoomLevel;
  ```

### High-DPI Display Scaling
To prevent blurry lines on Retina and 4K displays:
- Canvas backing store is scaled by `window.devicePixelRatio`:
  ```typescript
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ```

### 2D Spatial Indexing (`spatialIndex.ts`)
To maintain 60 FPS even on whiteboards with thousands of elements, Whiteboard.io uses a spatial acceleration grid:
- Partitions the infinite 2D world into uniform spatial cells.
- Insertion and updates index an element's axis-aligned bounding box (AABB).
- Viewport culling queries only elements intersecting the visible camera frustum:
  $$\text{Query Time} = O(\log N + K)$$
- Powers instantaneous bounding-box collision detection for mouse selections, lasso selections, and point-and-click hit tests.

### Selection Manipulation (`Canvas.tsx`, `elementMutations.ts`)
- Shift/Ctrl/Cmd-click and marquee selection build a multi-selection. Dragging any selected object moves the whole group while preserving relative positions; Alt-drag still duplicates only the grabbed object.
- Arrow keys nudge the whole selection, and the selection action bar or context menu can Lock / Unlock every selected object, including strokes, notes, text, shapes, icons, and wires.
- Locked objects stay selectable so they can be unlocked, but cannot be moved, nudged, edited, reordered, erased, or deleted.
- Bulk moves and lock changes are recorded in the existing local undo/redo stack; a history barrier keeps a lock toggle from merging into a preceding drag.

### Smooth Stroke Interpolation & Simplification (`strokeSimplification.ts`)
- **Real-time Smoothing**: Quadratic Bézier curves (`ctx.quadraticCurveTo`) smooth out intermediate pointer coordinates during live drawing.
- **Ramer-Douglas-Peucker (RDP) Simplification**: Finalized strokes undergo distance-epsilon point reduction to eliminate redundant collinear points before network broadcast, reducing network payload sizes by up to 70%.
- **Highlighter Mode**: Utilizes `ctx.globalCompositeOperation = 'multiply'` and semi-transparent alpha channels to highlight text and diagrams without obscuring underlying shapes.

### Smart Relational Connectors & Wires (`wireGeometry.ts`, `WireItem.tsx`)
- AI diagrams and manual connectors utilize dedicated `wire` elements.
- Features automatic magnetic terminal snapping to shape boundary anchor points (top, bottom, left, right).
- Calculates smooth cubic Bézier tangents based on connected node orientation and renders directional arrowheads.

### Eraser Collision Engine
The eraser tool supports two modes:
1. **Object Eraser**: Checks bounding box intersections and removes entire elements with one touch.
2. **Point Eraser**: Computes Euclidean distance to existing stroke points:
   $$\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$
   If the distance falls within the eraser radius, the element is deleted via `emitElementDelete`.

---

## 4. Local & Session Persistence Architecture

Whiteboard.io guarantees session continuity through a multi-tier client persistence layer:

### 1. Solo Mode Autosave (`soloStorage.ts`)
- For offline or local sketching without joining a multiplayer room.
- Automatically persists the complete whiteboard state to browser `localStorage` with a debounced 300ms writer.
- Supports snapshot recovery, last-saved timestamps, and safe board wipes.

### 2. Guest Identity Continuity (`guestIdentity.ts`)
- Preserves anonymous guest user profiles (unique guest ID, custom display name, and avatar color) across page reloads and room transitions.
- Eliminates the need to re-enter your name when jumping between collaborative rooms.

### 3. Recent Rooms Tracker (`recentRooms.ts`)
- Maintains an LRU cache of recently visited rooms in `localStorage`.
- Stores room codes, room titles, last-accessed timestamps, and host information.
- Displayed in the `SessionLauncherModal` and room creation interfaces for 1-click re-entry.

### 4. AI Session History Storage (`aiSessionStorage.ts`)
- Persists conversational diagram threads per room session.
- Retains prompt history, assistant responses, model notices, and graph representations so users can resume iterative diagram edits across browser refreshes.

---

## 5. Keyboard Shortcuts & Productivity Controls

A comprehensive set of single-key and modifier shortcuts accelerates canvas navigation and element manipulation:

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `V` or `1` | Select Tool | Select, move, and resize canvas elements |
| `H` or `2` | Pan / Hand Tool | Drag to navigate the canvas |
| `P` or `3` | Pen Tool | Freehand drawing |
| `M` or `4` | Highlighter | Transparent multi-layer highlighting |
| `E` or `5` | Eraser Tool | Toggle point eraser / object eraser |
| `S` or `6` | Sticky Note Tool | Place colored sticky notes |
| `T` or `7` | Text Tool | Insert and format rich text |
| `R` or `8` | Shape Tool | Insert rectangles, circles, diamonds, stars |
| `I` or `9` | Icon Library | Search and insert Lucide icons |
| `Ctrl + Z` / `Cmd + Z` | Undo | Revert last action |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo | Re-apply last reverted action |
| `Ctrl + C` / `Cmd + C` | Copy | Copy selected element to clipboard |
| `Ctrl + V` / `Cmd + V` | Paste | Paste copied element at cursor |
| `Ctrl + D` / `Cmd + D` | Duplicate | Duplicate selected element with offset |
| `Ctrl + A` / `Cmd + A` | Select All | Select all elements on canvas |
| `Delete` / `Backspace` | Delete | Delete selected elements |
| `[` / `]` | Layering | Send backward / bring forward |
| `Shift + [` / `Shift + ]` | Layering (Extremes) | Send to bottom / bring to top |
| `Arrow Keys` | Nudge | Move selected elements by 1px |
| `Shift + Arrow Keys` | Fast Nudge | Move selected elements by 10px |
| `Space + Drag` | Quick Pan | Temporarily pan without switching tools |
| `Ctrl + Scroll` / `Cmd + Scroll` | Zoom | Smooth zoom centered at cursor position |
| `Ctrl + 0` / `Cmd + 0` | Reset Zoom | Reset camera to 100% at origin |
| `?` or `Shift + /` | Shortcut Cheat Sheet | Open shortcuts reference modal |
| `Right Click` | Context Menu | Open context menu (Duplicate, Layering, Delete) |

---

## 6. AI Diagram Generation & Conversational Revision

### Generation Dialog (`AiGenerateModal.tsx`)
1. **Dynamic Engine Indicator**:
   Fetches `GET /api/ai/config` to display the active backend (e.g. *Gemini 3.8 Flash*, *Gemini 3.6 Flash*, *Ollama · llama3.2*, or *Offline procedural fallback*).
2. **Topology Styles**:
   - 🧠 **Mind Map**: Central core radiating outward to concept branches.
   - 🔀 **Flowchart**: Process DAG with decision logic diamonds and steps.
   - 📋 **Sticky Board**: Grid of Kanban or SWOT cards.
   - 🏗️ **Architecture**: Tiered cloud/microservice topology with connectors.
3. **Control Parameters**:
   - **Direction**: `horizontal`, `vertical`, `radial`, `free`.
   - **Detail Level**: `concise` (~4-6 nodes), `balanced` (~8-12 nodes), `detailed` (~15+ nodes).
4. **Viewport Centering**:
   Automatically computes world-space coordinates of the current user's viewport center so generated diagrams appear directly within view.

### Conversational Revision Drawer (`AiChatPanel.tsx`)
- Provides a conversational AI side panel accessible from the header toolbar.
- Allows team members to iteratively revise existing diagrams with plain English instructions (e.g. *"Add a Redis caching layer between API Gateway and PostgreSQL"*, *"Convert to horizontal flow"*).
- Calls `POST /api/ai/revise-diagram` with current semantic graph and conversation history.
- Computes differential element updates and atomically updates the whiteboard, preserving session undo/redo integrity.
- Displays model failover notifications (e.g. *"Gemini 3.8 Flash unavailable — Ollama · llama3.2 produced this diagram"*).
