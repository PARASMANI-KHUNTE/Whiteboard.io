# Client Architecture & Component Guide

This guide details the internal frontend architecture, state management hooks, canvas rendering pipeline, and component hierarchy of **Whiteboard.io**.

---

## 1. Component Hierarchy & Layout

The frontend is organized into modular React components centered around an infinite 2D canvas:

```
App.tsx
├── Header.tsx (Room status, users dropdown, voice toggle, auth buttons, theme toggle)
│   ├── AudioVisualizerBar.tsx (Waveform rendering & mic controls)
│   └── AdminPanelModal.tsx (Host room lock, user permissions, kick user)
├── Toolbar.tsx (Drawing tools, shapes, sticky notes, text, icons, colors, stroke width)
├── Canvas.tsx (Interactive drawing surface, coordinate transformation, remote cursors)
│   ├── ShapeItem.tsx (Rectangles, circles, diamonds, triangles, stars, arrows)
│   ├── StickyNoteItem.tsx (Draggable colored sticky notes with inline editing)
│   ├── TextItem.tsx (Rich text nodes with font styling and resizing)
│   └── IconItem.tsx (Lucide SVG icons with color/rotation transforms)
├── ZoomControls.tsx (Zoom in/out, pan reset, zoom-to-fit)
├── AuthModal.tsx (Login, registration, guest onboarding, Google sign-in)
├── CreateRoomModal.tsx (Room code generator, room naming, private lock)
├── ShareRoomModal.tsx (Shareable link, QR code, room code copy)
└── VoteToClearModal.tsx (Interactive voting modal with live consensus progress)
```

---

## 2. Core Custom Hooks

### 1. `useSocket(roomId, authUser, authToken)`
Located in [`client/src/hooks/useSocket.ts`](file:///f:/Codes/Projects/Whiteboard/Whiteboard.io/client/src/hooks/useSocket.ts).
- Manages the primary Socket.io connection to `BACKEND_URL`.
- Exposes real-time state:
  - `elements`: Key-value map of canvas elements (`Record<string, CanvasElement>`).
  - `users`: Map of active remote participants with cursors and speaking flags.
  - `liveStrokes`: In-flight drawing stroke points before completion.
  - `voteToClear`: Active vote timer and participant vote tallies.
  - `canWrite`: Boolean indicating whether the local user has write permissions.
  - `isHost`: Boolean indicating whether the local user is room administrator.
- Provides unified emission functions: `emitElementCreate`, `emitElementUpdate`, `emitElementDelete`, `emitCursorMove`, `emitAudioLevel`, `setParticipantPermission`, `kickParticipant`.

### 2. `useAuth()`
Located in [`client/src/hooks/useAuth.ts`](file:///f:/Codes/Projects/Whiteboard/Whiteboard.io/client/src/hooks/useAuth.ts).
- Manages authentication state with persistent storage in `localStorage`.
- Supports:
  - Account registration and login via `/api/auth/*`.
  - Ephemeral guest creation via `/api/auth/guest`.
  - Google OAuth popup flow with `postMessage` listener and URL hash redirect fallback (`#auth_token=`).
  - Room list querying via `/api/rooms/my-rooms`.

### 3. `useVoiceChat({ socket, currentUser, roomId, users })`
Located in [`client/src/hooks/useVoiceChat.ts`](file:///f:/Codes/Projects/Whiteboard/Whiteboard.io/client/src/hooks/useVoiceChat.ts).
- Initializes Web Audio API `AudioContext` and `AnalyserNode`.
- Captures microphone input (`navigator.mediaDevices.getUserMedia`).
- Detects vocal speech using volume thresholding and broadcasts real-time `audio-level` packets.
- Establishes peer-to-peer `RTCPeerConnection` mesh connections with remote participants.
- Handles audio track streaming, muting, deafening, and fallback simulated audio bars when mic access is blocked by browser policies.

### 4. `useTheme()`
Located in [`client/src/hooks/useTheme.ts`](file:///f:/Codes/Projects/Whiteboard/Whiteboard.io/client/src/hooks/useTheme.ts).
- Toggles dark mode and light mode.
- Syncs state with `localStorage` and toggles the `dark` class on the root HTML document.

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

### Smooth Stroke Interpolation
Rather than drawing rigid polygonal lines between sampled mouse points:
- Quadratic Bézier curves (`ctx.quadraticCurveTo`) smooth out intermediate pointer coordinates.
- Highlighter strokes utilize `ctx.globalCompositeOperation = 'multiply'` and semi-transparent alpha channels to highlight text and diagrams without obscuring underlying shapes.

### Eraser Collision Engine
The eraser tool supports two modes:
1. **Object Eraser**: Checks bounding box intersections and removes entire elements with one touch.
2. **Point Eraser**: Computes Euclidean distance to existing stroke points:
   $$\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$
   If the distance falls within the eraser radius, the element is deleted via `emitElementDelete`.

---

## 4. Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `V` or `1` | Select / Move Tool |
| `H` or `2` | Hand / Pan Tool |
| `P` or `3` | Pen / Pencil Tool |
| `M` or `4` | Highlighter Tool |
| `E` or `5` | Eraser Tool |
| `S` or `6` | Sticky Note Tool |
| `T` or `7` | Text Tool |
| `R` or `8` | Shape Tool |
| `I` or `9` | Icon Library Tool |
| `Ctrl + Z` / `Cmd + Z` | Undo last action |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo action |
| `Delete` / `Backspace` | Delete selected element |
| `Space + Drag` | Pan across canvas |
| `Ctrl + Scroll` / `Cmd + Scroll` | Zoom in and out |
| `Ctrl + 0` | Reset zoom to 100% |
