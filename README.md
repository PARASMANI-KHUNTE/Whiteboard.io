# 🎨 Whiteboard.io — Real-Time Collaborative Whiteboard

An enterprise-grade, real-time collaborative digital whiteboard built with **React**, **TypeScript**, **Node.js**, **Socket.io**, **WebRTC**, and **MongoDB**.

Designed for distributed teams, design sprint brainstorming, remote tutoring, and interactive sketching with zero latency, live cursors, voice chat, and granular permission controls.

---

## 💡 What is Whiteboard.io?

**Whiteboard.io** is an all-in-one collaborative visual workspace engineered from the ground up for modern distributed engineering teams, product designers, educators, and creative thinkers. 

Rather than treating a digital whiteboard as just a flat drawing canvas or an expensive enterprise subscription silo, Whiteboard.io merges **instant visual ideation**, **built-in spatial voice communication**, and **state-of-the-art AI diagram generation** into an open, frictionless platform that runs anywhere with zero setup.

---

## 🥊 Why Whiteboard.io? (How It Differs From Alternatives)

Most existing whiteboards force compromises: either you pay heavy per-seat monthly subscriptions for closed-source corporate platforms, or you use simple drawing tools that lack integrated voice, AI synthesis, or room governance. Here is how Whiteboard.io stands out:

### Feature Comparison Matrix

| Capability | Whiteboard.io | Miro | Excalidraw | FigJam | Google Jamboard |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Integrated Gemini AI Diagrams** | ✅ **Free & Built-In** (Mindmaps, Flowcharts, Sticky Boards, Architecture) | 💰 Paid Add-on | ⚠️ Limited / External Plugin | 💰 Paid / Credit Capped | ❌ Deprecated / Dead |
| **5-Layer AI Rate-Limit Shield** | ✅ **Guaranteed 100% Uptime** (Queue pacing, caching, procedural fallback) | ❌ Standard 429 errors | ❌ N/A | ❌ Hard caps | ❌ No AI |
| **Built-in Peer-to-Peer Voice Mesh** | ✅ **Native WebRTC Audio** with Live Waveform Visualizer | 💰 Enterprise Only | ❌ Requires Zoom/Discord | ⚠️ Basic Audio | ❌ Requires Google Meet |
| **Consensus Vote-to-Clear Protection** | ✅ **Democratic 15s Countdown** (Prevents accidental/troll board wipes) | ❌ Host wipe or undo | ❌ Anyone can clear | ❌ Anyone can clear | ❌ Anyone can clear |
| **Host Moderation & Governance** | ✅ **Lock Room, Toggle User Drawing Privileges, Kick Users** | 💰 Team/Enterprise Tier | ❌ Basic / None | 💰 Paid Tier | ❌ Minimal |
| **Self-Hostable & 100% Open Source** | ✅ **MIT License** (Run on Render, Docker, Railway, or VPS) | ❌ Proprietary SaaS | ⚠️ Client only (Backend custom) | ❌ Proprietary SaaS | ❌ Shut Down |
| **Frictionless Guest Onboarding** | ✅ **1-Click Ephemeral Guests** + Google OAuth + Email Accounts | ⚠️ Requires account for full tools | ✅ Instant | ⚠️ Requires Figma account | ⚠️ Requires Google account |
| **Persistent Cloud Database** | ✅ **MongoDB Native Driver** with TTL session cleanup | ❌ Vendor Lock-in | ⚠️ Ephemeral / LocalStorage | ❌ Figma Cloud Lock-in | ❌ Deprecated |

### Key Differentiators Explained

1. **⚡ Native AI Diagram Generation with Zero Failure Rate**:
   Unlike platforms where AI features are gated behind $20/user/month paywalls or frequently crash with `429 Too Many Requests`, Whiteboard.io integrates Google Gemini 2.5 Flash with an enterprise-grade 5-layer rate-limit shield. It paces outbound requests, caches popular structures for 2 hours, and includes an offline procedural generator that guarantees your brainstorming flow is never interrupted.

2. **🎙️ No More "Can You Send the Zoom Link?"**:
   Whiteboard.io eliminates meeting tab fatigue. With native WebRTC mesh voice chat and real-time audio visualizers, participants speak directly through the whiteboard. Green audio rings pulsate around multiplayer cursors as team members talk, creating a genuine sense of co-presence.

3. **🛡️ Anti-Troll & Accidental Wipe Protection**:
   In large collaborative sessions, a single rogue click can clear hours of work. Whiteboard.io introduces a **Consensus Vote-to-Clear** mechanism: wiping the canvas requires a 15-second democratic vote where participants cast their ballots in real time. For organized presentations, hosts can lock the canvas into view-only mode or revoke drawing privileges for specific attendees.

4. **🔓 Complete Data Sovereignty & Zero Vendor Lock-in**:
   Your architectural diagrams, sprint retrospectives, and product blueprints belong to you. Whiteboard.io is 100% open-source, connects directly to your own MongoDB instance, and can be deployed to your own private cloud or local intranet with a single command.

---

## 🚀 Key Features

* **✨ Gemini AI Diagram & Mind Map Generator**:
  * Generate instant visual diagrams using Google Gemini 2.5 Flash from natural language prompts.
  * 4 Specialized styles: 🧠 **Mind Maps** (radial hubs), 🔀 **Flowcharts** (decision diamonds & step boxes), 📋 **Sticky Boards** (SWOT / Kanban columns), and 🏗️ **System Architectures**.
  * **5-Layer Rate-Limit Shield**: Outbound request throttling queue (3s spacing), in-memory response cache (2hr TTL), exponential backoff retries, and offline procedural fallback engine.
  * Real-time batch insertion that broadcasts new elements to all connected users instantly.
* **⚡ Real-Time Collaboration**: Sub-50ms drawing synchronization across unlimited concurrent users powered by Socket.io and optimistic rendering.
* **🖌️ Infinite Canvas Engine**: Smooth pan, pinch-to-zoom, high-DPI Retina scaling, and quadratic Bézier curve stroke smoothing.
* **📐 Rich Creative Toolset**:
  * **Freehand & Highlighter**: Configurable stroke thickness, opacity, and color palette.
  * **Smart Shapes**: Rectangles, circles, diamonds, triangles, stars, and directional arrows with fill and border styling.
  * **Sticky Notes**: Draggable, colored sticky notes with real-time text editing.
  * **Rich Text**: Custom font sizes, bold, italic, underline, and alignments.
  * **Icon Library**: Built-in searchable Lucide icons with scaling and background shapes.
* **🎙️ Peer-to-Peer Voice Chat**: Integrated WebRTC audio mesh with mute, deafen, and live audio-frequency waveform visualizers.
* **👥 Multiplayer Cursors & Presence**: Real-time cursor tracking with participant names, colors, and audio-reactive speaking indicators.
* **🗳️ Consensus Vote-to-Clear**: Democratic 15-second countdown voting mechanism to prevent accidental board wipes.
* **🛡️ Admin & Host Governance**:
  * Lock canvas into View-Only mode for participants.
  * Grant or revoke drawing permissions per user.
  * Kick/eject disruptive participants with custom reasons.
  * Automatic host election/migration when the original room owner leaves.
* **🔐 Complete Authentication Suite**:
  * Secure Email & Password accounts with PBKDF2 hashing and unique 64-byte salts.
  * **Google OAuth 2.0** with popup handling and direct URL hash redirect fallback (`#auth_token=`).
  * One-click Anonymous Guest identities with persistent session tokens.
* **💾 Persistent Storage**: All boards, elements, metadata, and user accounts are persisted to MongoDB.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, Lucide Icons |
| **Canvas Engine** | HTML5 Canvas 2D API, Web Audio API, AnalyserNode |
| **Artificial Intelligence**| Google Gemini 2.5 Flash, Structured JSON Schema Generation |
| **Real-Time Signaling** | Socket.io Client, WebRTC `RTCPeerConnection` (Mesh) |
| **Backend** | Node.js (ESM), Express 4, Socket.io Server |
| **Database** | MongoDB 7 / MongoDB Atlas Native Node Driver |
| **Security** | PBKDF2 Cryptographic Hashing, Rate Limiting, CORS Allowlist |
| **Deployment** | Render, Railway, Vercel, Docker, Fly.io |

---

## 📚 In-Depth Project Documentation

For exhaustive technical guides, explore the dedicated documentation modules:

* 🏛️ **[System Architecture & Data Flow](docs/ARCHITECTURE.md)**: Deep dive into the real-time event pipeline, state conflict resolution, debounced persistence, and MongoDB database schemas.
* 📡 **[REST API & Socket.io Events Reference](docs/API_AND_EVENTS.md)**: Complete specification of all REST endpoints (`/api/auth/*`, `/api/rooms/*`, `/health`) and real-time Socket.io emitter/listener protocols.
* 🚢 **[Deployment & Cloud Hosting Guide](docs/DEPLOYMENT_GUIDE.md)**: Step-by-step instructions for deploying to Render (Fullstack Web Service vs Split Static Site + Web Service), Vercel, Google OAuth Console setup, and MongoDB Atlas.
* 💻 **[Client Architecture & Component Guide](docs/CLIENT_GUIDE.md)**: Detailed overview of React component hierarchy, custom hooks (`useSocket`, `useAuth`, `useVoiceChat`), canvas rendering maths, and keyboard shortcuts.

---

## ⚡ Quick Start (Local Development)

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **MongoDB**: A running local MongoDB instance (`mongodb://127.0.0.1:27017`) or a free [MongoDB Atlas](https://www.mongodb.com/atlas) connection string.

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/PARASMANI-KHUNTE/Whiteboard.io.git
cd Whiteboard.io

# Install client and server dependencies
npm run install:all
```

### 2. Configure Environment Variables
Create your local environment files:

**Server Environment** (`server/.env`):
```env
PORT=3000
APP_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/whiteboard

# Google Gemini API Key for AI Diagram & Mind Map Generation
GEMINI_API_KEY=your_gemini_api_key_here

# Optional Google OAuth Credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**Client Environment** (`client/.env`):
```env
# Leave empty in local dev to use Vite's built-in dev proxy
VITE_BACKEND_URL=http://127.0.0.1:3000
```

### 3. Run the Development Servers
Open two terminal windows:

```bash
# Terminal 1: Start Backend Server (runs on http://localhost:3000)
cd server
npm run dev

# Terminal 2: Start Frontend Client (runs on http://localhost:5173)
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Open multiple tabs or incognito windows to test live multiplayer collaboration!

---

## 🌐 Production Deployment Summary

### Option A: Full-Stack Web Service (Recommended)
Deploying on **Render**, **Railway**, or a single VPS:
1. Create a **Web Service** with **Node** runtime.
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start`
4. Set environment variables:
   * `APP_URL`: `https://<your-service>.onrender.com`
   * `MONGODB_URI`: `<your_atlas_connection_string>`
   * `GEMINI_API_KEY`: `your_gemini_api_key_here`
   * `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: *(From Google Cloud Console)*

### Option B: Split Frontend (Static) & Backend (Web Service)
* **Backend (Render Web Service)**:
  * Runs Node server on `https://<your-backend>.onrender.com`.
  * Set `APP_URL=https://<your-frontend>.onrender.com` to allow CORS and OAuth redirects.
  * Set `GEMINI_API_KEY=your_gemini_api_key_here`.
* **Frontend (Render Static Site or Vercel)**:
  * Publishes `client/dist`.
  * Set `VITE_BACKEND_URL=https://<your-backend>.onrender.com`.

---

## ⌨️ Keyboard Shortcuts Reference

| Key | Tool / Action | Key | Tool / Action |
| :---: | :--- | :---: | :--- |
| `V` / `1` | Select / Move | `S` / `6` | Sticky Note |
| `H` / `2` | Hand / Pan | `T` / `7` | Text Box |
| `P` / `3` | Freehand Pen | `R` / `8` | Shapes |
| `M` / `4` | Highlighter | `I` / `9` | Icon Library |
| `E` / `5` | Eraser | `Ctrl + Z` | Undo |
| `Space + Drag` | Pan Canvas | `Ctrl + Y` | Redo |
| `Scroll` | Pan Canvas | `Delete` | Delete Element |

---

## 📄 License

This project is licensed under the MIT License — see the repository for details.
