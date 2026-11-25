# Comprehensive Deployment & Hosting Guide

This guide provides step-by-step instructions for hosting **Whiteboard.io** in production across multiple deployment topologies.

## Prerequisites

* **Node.js >=20.19.0** (22 LTS recommended; required by the MongoDB 7 driver). The repository includes an `.nvmrc` pinning Node 22.
* **A reachable MongoDB instance** (Atlas or self-hosted). `MONGODB_URI` is required in practice: the server awaits the connection before listening and exits if it cannot connect. There is no in-memory database fallback.

---

## 1. Architecture Topologies

You can host Whiteboard.io in two ways:

| Topology | Frontend | Backend | Best For |
| :--- | :--- | :--- | :--- |
| **Option A: Full-Stack Single Web Service** | Render / Railway / Fly.io / VPS | Same domain as frontend | **Simplest & Recommended**. No CORS issues, zero URL mismatch, single build. |
| **Option B: Split Static Frontend + Backend Web Service** | Render Static Site / Vercel / Netlify | Render Web Service / Railway | Global CDN for frontend static assets with an independent WebSocket server. |

---

## 2. Option A: Full-Stack Single Deployment (Recommended)

In this mode, the Node.js Express server automatically builds and serves the React client bundle from `client/dist` alongside the `/api` and `/socket.io` endpoints.

### Deploying on Render:
1. Go to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service** *(do not choose "Static Site")*.
3. Connect your GitHub / GitLab repository.
4. Fill in the service configuration:
   - **Name**: `whiteboard-app`
   - **Environment / Runtime**: `Node`
   - **Branch**: `main`
   - **Root Directory**: *(leave blank — the build and start commands below expect the repository root)*
   - **Build Command**:
     ```bash
     npm run build
     ```
     *(Uses the root `package.json` to build both client and server automatically)*.
   - **Start Command**:
     ```bash
     npm start
     ```
     *(Runs `node server/dist/server.js`; Render injects `PORT`, so do not set it manually)*.
5. In **Environment Variables**, add:
   - `APP_URL`: `https://whiteboard-io-1.onrender.com` *(the public URL of this service; set it to your own deployed frontend/monolith URL)*
   - `MONGODB_URI`: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/whiteboard?retryWrites=true&w=majority`
   - `AI_PROVIDER`: `gemini` *(or `ollama` for a self-hosted local model)*
   - `GEMINI_API_KEY`: `your-google-gemini-api-key` *(From [Google AI Studio](https://aistudio.google.com/app/apikey))*
   - `GOOGLE_CLIENT_ID`: `your-google-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `your-google-client-secret`

---

## 3. Option B: Split Frontend & Backend Deployment

### Step 1: Deploy Backend (Render Web Service)
1. In Render, create a **Web Service** (e.g., `whiteboard-backend`).
2. **Root Directory**: leave blank. The commands below start at the repository root and change into `server` themselves.
3. **Build Command**: `cd server && npm install && npm run build`
4. **Start Command**: `node server/dist/server.js`. Render injects `PORT`; do not override it.
5. **Environment Variables**:
   ```env
   APP_URL=https://whiteboard-frontend.onrender.com
   SERVER_URL=https://whiteboard-backend.onrender.com
   MONGODB_URI=your_mongodb_connection_string
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-google-gemini-api-key
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```
   Replace `APP_URL` with your deployed frontend URL (for example, a Vercel URL) without any inline notes; include that exact origin in `CLIENT_URL` or `ALLOWED_ORIGINS` if it differs from `APP_URL`.

### Step 2: Deploy Frontend (Render Static Site or Vercel)
1. Create a **Static Site** on Render (or import project into Vercel).
2. **Root Directory**: `client`
3. **Build Command**: `npm run build`
4. **Publish Directory**: `dist`
5. **Environment Variables**:
   ```env
   VITE_BACKEND_URL=https://whiteboard-backend.onrender.com
   ```
*(This instructs the React client to direct all API and Socket.io traffic to the backend server)*.

---

## 4. Google OAuth 2.0 Configuration

To enable **Continue with Google**, configure credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Click **Create Credentials** ➔ **OAuth client ID**.
2. Select **Web application**.
3. **Authorized JavaScript origins**:
   Add every domain where the frontend interface will run:
   ```text
   https://whiteboard-frontend.onrender.com
   https://whiteboard-backend.onrender.com
   http://localhost:5173
   http://localhost:3000
   ```
4. **Authorized redirect URIs**:
   Add the backend callback URL:
   ```text
   https://whiteboard-backend.onrender.com/auth/google/callback
   http://localhost:3000/auth/google/callback
   ```
5. Copy your **Client ID** and **Client Secret** into your server environment variables (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`).

> [!IMPORTANT]
> Google redirect URIs must match **character-for-character** (including `https://`, domain, and `/auth/google/callback`). If you see `Error 400: redirect_uri_mismatch`, check the URL in the error details and add it to your Authorized redirect URIs.

### OAuth state cookie and cross-site hosting

Both `/api/auth/google/start` (used by the popup) and `/api/auth/google/url` create a short-lived (10 minute) random nonce, store it in the base64url `state` parameter, and set an `HttpOnly` cookie named `wb_oauth_nonce`. The cookie is `SameSite=Lax` when frontend and backend share a host, and `SameSite=None; Secure` for split deployments so browsers can store it across sites. `/auth/google/callback` clears the cookie and rejects any callback whose state is missing, expired, or does not match that cookie with an `HTTP 400` page and a `GOOGLE_OAUTH_ERROR` postMessage to the opener. The callback also only accepts the redirect URI that the server originally issued.

The popup navigates directly to `/api/auth/google/start` on the backend, so the nonce cookie is set in a first-party top-level navigation rather than a cross-site `fetch`. The frontend origin must still be in the server's CORS/trusted-origin allowlist (`APP_URL`, `CLIENT_URL`, or `ALLOWED_ORIGINS`) so the callback can deliver the token with `postMessage`.

---

## 5. MongoDB Database Setup (Atlas)

1. Create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Under **Network Access**, configure ingress IP access:
   - **Recommended (Restricted Access)**: Add only the documented outbound/egress IP addresses of your hosting provider (such as [Render Static Outbound IPs](https://render.com/docs/static-outbound-ip-addresses) or your cloud platform's VPC peering / private networking). This ensures only your application containers can communicate with the database.
   - **Prototyping / Dynamic IP Fallback**: If your hosting tier lacks static outbound IPs, you may temporarily add `0.0.0.0/0` ("Allow Access from Anywhere").

> [!WARNING]
> Setting Network Access to `0.0.0.0/0` exposes your database cluster port directly to the public internet, leaving authentication credentials as the sole barrier against unauthorized access and brute-force attempts. For production workloads, always restrict IP access to known CIDR blocks, enforce strong complex database passwords, and enable IP access auditing in MongoDB Atlas.
3. Under **Database Access**, create a user and password.
4. Copy the connection string:
   ```text
   mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/whiteboard?retryWrites=true&w=majority
   ```
5. Set this value as `MONGODB_URI` in your backend environment variables.

---

## 6. WebRTC STUN / TURN Server Configuration

Peer-to-peer voice chat uses Google's public STUN servers by default:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

If users are on restrictive enterprise firewalls, configure a TURN relay server in `client/.env`:
```env
VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
VITE_TURN_URL=turn:turn.yourcompany.com:3478
VITE_TURN_USERNAME=your_turn_user
VITE_TURN_PASSWORD=your_turn_password
```

---

## 7. Environment Variables Reference

### Client Environment (`client/.env`)

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `VITE_BACKEND_URL` | Deployed backend URL (e.g. `https://api.domain.com`) | Yes (if separate host) | `""` (uses current origin / dev proxy) |
| `VITE_ALLOWED_ORIGINS` | Comma-separated domains allowed for OAuth postMessage | No | Dev localhost origins |
| `VITE_STUN_URLS` | Comma-separated STUN server URLs | No | Google public STUN |
| `VITE_TURN_URL` | Comma-separated TURN server URLs | No | None |
| `VITE_TURN_USERNAME` | TURN server username | No | None |
| `VITE_TURN_PASSWORD` | TURN server authentication secret | No | None |

### Server Environment (`server/.env`)

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP server listening port; leave unset on Render/Railway so the platform can inject it | No | `3000` |
| `APP_URL` | Primary frontend origin used for CORS and as the OAuth `postMessage` return origin | Yes | `http://localhost:5173` |
| `CLIENT_URL` | Additional frontend origin(s) allowed for CORS and OAuth; comma-separated | No | None |
| `ALLOWED_ORIGINS` | Additional comma-separated origins allowed for CORS and OAuth `postMessage` | No | Local dev origins |
| `SERVER_URL` | Public backend origin used to build the Google OAuth callback URL behind proxies | No | Request protocol/host |
| `MONGODB_URI` | MongoDB connection URI (required; startup fails if MongoDB is unreachable) | Yes | `mongodb://127.0.0.1:27017/whiteboard` |
| `TRUST_PROXY` | Only trust X-Forwarded-For when deployed behind a known number of reverse proxies (e.g. 1 on Render/Railway/nginx) | No | Unset (`false`) |
| `HTTP_REQUEST_TIMEOUT_MS` | Maximum duration in milliseconds for completing incoming HTTP requests | No | `60000` |
| `HTTP_HEADERS_TIMEOUT_MS` | Maximum duration in milliseconds to receive complete HTTP headers (must exceed request timeout) | No | `65000` |
| `AI_QUEUE_MAX_DEPTH` | Maximum pending AI requests in the pacing queue before returning HTTP 429 | No | `24` |
| `AI_CACHE_MAX_ENTRIES` | Maximum LRU cache entries for generated diagrams | No | `256` |
| `AI_PROVIDER` | Which AI engine to use: `gemini`, `ollama`, or `fallback`. Unset auto-picks Gemini when `GEMINI_API_KEY` exists, otherwise Ollama when configured | No | auto |
| `GEMINI_API_KEY` | Google Gemini API key for AI diagram generation | No (optional; uses Ollama or procedural fallback if unset) | `""` |
| `GEMINI_MODEL` | Gemini model id (first link in the failover chain) | No | `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Comma-separated Gemini models tried when the primary is unavailable; `none` disables Gemini failover | No | `gemini-flash-lite-latest,gemini-3.6-flash` |
| `GEMINI_TIMEOUT_MS` | Per-attempt Gemini request timeout | No | `45000` |
| `AI_ALLOW_OLLAMA_FALLBACK` | In `gemini` or `auto` mode, fall back to local Ollama after all Gemini models fail; set `false` to disable | No | `true` |
| `OLLAMA_MODEL` | Local Ollama model used for generation | No | `llama3.2` |
| `OLLAMA_BASE_URL` | Ollama server base URL | No | `http://127.0.0.1:11434` |
| `OLLAMA_TIMEOUT_MS` | Per-request timeout for local generation | No | `180000` |
| `OLLAMA_NUM_CTX` | Ollama context window | No | `12288` |
| `OLLAMA_NUM_PREDICT` | Max tokens generated per request | No | `6144` |
| `OLLAMA_KEEP_ALIVE` | How long Ollama keeps the model loaded | No | `10m` |
| `OLLAMA_MIN_INTERVAL_MS` | Minimum gap between local model calls | No | `250` |
| `OLLAMA_API_KEY` | Bearer token for a remote/protected Ollama server | No | `""` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID | Yes (for OAuth) | None |
| `GOOGLE_CLIENT_SECRET`| Google OAuth 2.0 Client Secret | Yes (for OAuth) | None |
| `GOOGLE_CALLBACK_URL` | Explicit redirect URI override sent to Google | No | `${SERVER_URL}/auth/google/callback` |
| `VOTE_CLEAR_DURATION_MS` | Vote-to-clear duration in milliseconds | No | `15000` |
