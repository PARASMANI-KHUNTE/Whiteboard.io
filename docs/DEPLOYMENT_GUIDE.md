# Comprehensive Deployment & Hosting Guide

This guide provides step-by-step instructions for hosting **Whiteboard.io** in production across multiple deployment topologies.

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
   - **Root Directory**: *(leave blank)*
   - **Build Command**:
     ```bash
     npm run build
     ```
     *(Uses the root `package.json` to build both client and server automatically)*.
   - **Start Command**:
     ```bash
     npm start
     ```
     *(Runs `node server/dist/server.js`)*.
5. In **Environment Variables**, add:
   - `PORT`: `3000` *(Render provides this automatically, but setting 3000 ensures consistency)*
   - `APP_URL`: `https://whiteboard-app.onrender.com`
   - `MONGODB_URI`: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/whiteboard?retryWrites=true&w=majority`
   - `GEMINI_API_KEY`: `your-google-gemini-api-key` *(From [Google AI Studio](https://aistudio.google.com/app/apikey))*
   - `GOOGLE_CLIENT_ID`: `your-google-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `your-google-client-secret`

---

## 3. Option B: Split Frontend & Backend Deployment

### Step 1: Deploy Backend (Render Web Service)
1. In Render, create a **Web Service** (e.g., `whiteboard-backend`).
2. **Build Command**: `cd server && npm install && npm run build`
3. **Start Command**: `node server/dist/server.js`
4. **Environment Variables**:
   ```env
   PORT=3000
   APP_URL=https://whiteboard-frontend.onrender.com (or your Vercel URL)
   MONGODB_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your-google-gemini-api-key
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

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

---

## 5. MongoDB Database Setup (Atlas)

1. Create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Under **Network Access**, add `0.0.0.0/0` to allow connections from cloud hosts like Render or Railway.
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
| `PORT` | HTTP server listening port | No | `3000` |
| `APP_URL` | Frontend URL allowed for CORS and OAuth return | Yes | `http://localhost:5173` |
| `MONGODB_URI` | MongoDB connection URI | Yes | `mongodb://127.0.0.1:27017/whiteboard` |
| `GEMINI_API_KEY` | Google Gemini API key for AI diagram generation | No (optional; uses procedural fallback if unset) | `""` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID | Yes (for OAuth) | None |
| `GOOGLE_CLIENT_SECRET`| Google OAuth 2.0 Client Secret | Yes (for OAuth) | None |
| `GOOGLE_CALLBACK_URL` | Explicit redirect URI override sent to Google | No | `${SERVER_URL}/auth/google/callback` |
| `VOTE_CLEAR_DURATION_MS` | Vote-to-clear duration in milliseconds | No | `15000` |
