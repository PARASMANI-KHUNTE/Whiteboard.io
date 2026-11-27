import express from "express";
import crypto from "crypto";
import {
  registerUser,
  loginUser,
  createGuestUser,
  findOrCreateGoogleUser,
  getUserByToken,
} from "../auth";
import {
  createOAuthState,
  verifyOAuthState,
  oauthCookieOptions,
  authCookieOptions,
  extractAuthToken,
  OAUTH_NONCE_COOKIE,
  AUTH_COOKIE_NAME,
} from "../oauthState";
import { resolveTrustedOriginFromSet } from "../corsOrigins";

export function escapeHtml(str: string): string {
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
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function getGoogleRedirectUri(req: express.Request, port: number): string {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("host") || `localhost:${port}`;
  const serverOrigin = (process.env.SERVER_URL || `${protocol}://${host}`).replace(/\/$/, "");
  return (process.env.GOOGLE_CALLBACK_URL || `${serverOrigin}/auth/google/callback`).trim();
}

export interface GoogleAuthRequest {
  nonce: string;
  state: string;
  url: string;
  redirectUri: string;
}

export function buildGoogleAuthRequest(
  req: express.Request,
  trustedOrigin: string,
  port: number
): GoogleAuthRequest | null {
  const redirectUri = getGoogleRedirectUri(req, port);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;

  const nonce = crypto.randomBytes(24).toString("base64url");
  const state = createOAuthState({ redirectUri, origin: trustedOrigin, nonce, issuedAt: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });

  return {
    nonce,
    state,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirectUri,
  };
}

export function setOAuthNonceCookie(
  req: express.Request,
  res: express.Response,
  auth: GoogleAuthRequest,
  trustedOrigin: string
): void {
  let serverOrigin: string | undefined;
  try {
    serverOrigin = new URL(auth.redirectUri).origin;
  } catch {
    serverOrigin = undefined;
  }
  res.cookie(
    OAUTH_NONCE_COOKIE,
    auth.nonce,
    oauthCookieOptions({
      frontendOrigin: trustedOrigin,
      serverOrigin,
      secure: req.secure || req.get("x-forwarded-proto") === "https",
    })
  );
}

export function getRequestServerOrigin(req: express.Request): string | undefined {
  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/$/, "");
  return host ? `${protocol}://${host}` : undefined;
}

export function setAuthCookie(
  req: express.Request,
  res: express.Response,
  token: string,
  frontendOrigin?: string
): void {
  const opts = authCookieOptions({
    frontendOrigin: frontendOrigin || req.headers.origin,
    serverOrigin: getRequestServerOrigin(req),
    secure: req.secure || req.get("x-forwarded-proto") === "https",
  });
  res.cookie(AUTH_COOKIE_NAME, token, opts);
}

export function clearAuthCookie(req: express.Request, res: express.Response): void {
  const opts = authCookieOptions({
    frontendOrigin: req.headers.origin,
    serverOrigin: getRequestServerOrigin(req),
    secure: req.secure || req.get("x-forwarded-proto") === "https",
  });
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: opts.path,
  });
}

export interface AuthRoutesOptions {
  authRateLimiter: (limit: number, windowMs: number, keyPrefix: string) => express.RequestHandler;
  allowedOriginSet: Set<string>;
  port: number;
}

export function setupAuthRoutes(app: express.Express, options: AuthRoutesOptions): void {
  const { authRateLimiter, allowedOriginSet, port } = options;

  const resolveTrustedOrigin = (rawOrigin?: string): string => {
    return resolveTrustedOriginFromSet(allowedOriginSet, rawOrigin, process.env.APP_URL);
  };

  // Authentication Routes with Rate Limiting
  app.post("/api/auth/register", authRateLimiter(15, 60000, "auth-register"), async (req, res) => {
    try {
      const { username, email, password, name, color } = req.body;
      const result = await registerUser({ username, email, password, name, color });
      setAuthCookie(req, res, result.token);
      res.json({ success: true, user: result.user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter(15, 60000, "auth-login"), async (req, res) => {
    try {
      const { identifier, password } = req.body;
      const result = await loginUser(identifier, password);
      setAuthCookie(req, res, result.token);
      res.json({ success: true, user: result.user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Login failed" });
    }
  });

  app.post("/api/auth/guest", authRateLimiter(30, 60000, "auth-guest"), async (req, res) => {
    try {
      const { name, color } = req.body;
      const result = await createGuestUser(name, color);
      setAuthCookie(req, res, result.token);
      res.json({ success: true, user: result.user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Guest session failed" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearAuthCookie(_req, res);
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
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

  // Google OAuth URL generator
  app.get("/api/auth/google/url", (req, res) => {
    const originParam = (req.query.origin as string)?.trim();
    const trustedOrigin = resolveTrustedOrigin(originParam || req.get("origin") || "");
    const auth = buildGoogleAuthRequest(req, trustedOrigin, port);

    if (!auth) {
      res.json({
        configured: false,
        redirectUri: getGoogleRedirectUri(req, port),
        message: "GOOGLE_CLIENT_ID not configured in server/.env",
      });
      return;
    }

    setOAuthNonceCookie(req, res, auth, trustedOrigin);
    res.json({
      configured: true,
      url: auth.url,
      redirectUri: auth.redirectUri,
    });
  });

  // Top-level entry point used by the popup. Setting the nonce cookie during a
  // first-party navigation to the backend avoids cross-site cookie blocking in
  // split frontend/backend deployments.
  app.get(["/api/auth/google/start", "/api/auth/google/start/"], (req, res) => {
    const originParam = (req.query.origin as string)?.trim();
    const trustedOrigin = resolveTrustedOrigin(originParam || req.get("origin") || "");
    const auth = buildGoogleAuthRequest(req, trustedOrigin, port);

    if (!auth) {
      const safeTargetOriginJs = safeJsonForScript(trustedOrigin);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Unavailable</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Google Sign-In Unavailable</h3>
            <p>Google OAuth is not configured on the server. Please contact the administrator.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: 'Google OAuth is not configured on the server.' }, ${safeTargetOriginJs});
                setTimeout(() => window.close(), 1500);
              } else {
                setTimeout(() => { window.location.href = ${safeTargetOriginJs}; }, 2000);
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    setOAuthNonceCookie(req, res, auth, trustedOrigin);
    res.redirect(auth.url);
  });

  // Google OAuth Callback Handler (Popup Window)
  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
    const { code, error, state } = req.query;

    // The nonce is single-use and must match the cookie set when this browser
    // started the flow. Without this check an attacker could replay their own
    // OAuth result in a victim's browser (login CSRF).
    const validState = verifyOAuthState(state, req.headers.cookie);
    res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/" });

    if (!validState) {
      const safeTargetOriginJs = safeJsonForScript(resolveTrustedOrigin());
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#fff1f2;color:#9f1239;">
            <h3>Sign-In Request Invalid</h3>
            <p>This sign-in request has expired or could not be verified. Please try again.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: 'Invalid or expired sign-in request' }, ${safeTargetOriginJs});
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

    const targetOrigin = resolveTrustedOrigin(validState.origin);

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
      // Use only the redirect uri this server issued; never trust a callback
      // payload to choose where the authorization code is exchanged.
      const expectedRedirectUri = getGoogleRedirectUri(req, port);
      const redirectUri = validState.redirectUri === expectedRedirectUri ? validState.redirectUri : "";
      if (!redirectUri) {
        throw new Error("Invalid OAuth callback configuration");
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
        verified_email: profile.verified_email === true,
      });

      setAuthCookie(req, res, result.token, targetOrigin);

      // Send postMessage to main window with validated targetOrigin and close popup.
      // Never embed or persist the session token in localStorage or URL hash.
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
              const user = ${safeUserJs};
              const targetOrigin = ${safeTargetOriginJs};

              // Notify opener window if popup was used (httpOnly cookie is already set)
              let notifiedOpener = false;
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({
                    type: 'GOOGLE_OAUTH_SUCCESS',
                    user: user
                  }, targetOrigin);
                  notifiedOpener = true;
                  setTimeout(() => window.close(), 400);
                } catch (err) {
                  console.warn('Could not postMessage to opener:', err);
                }
              }

              // Fallback: If no opener (e.g. redirected or popup blocked), redirect to app cleanly
              if (!notifiedOpener) {
                const redirectTarget = targetOrigin.replace(/\\/$/, '') + '/';
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
}
