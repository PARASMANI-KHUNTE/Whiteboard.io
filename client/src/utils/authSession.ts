// Shared "session is no longer valid" signal. REST calls, AI calls and socket
// errors can all discover an expired token; they publish one throttled event
// and useAuth is the single place that clears credentials and provisions a
// replacement guest session.

export const SESSION_EXPIRED_EVENT = 'whiteboard:session-expired';

export interface SessionExpiredDetail {
  reason: string;
  /** False when even guest provisioning failed and the user must sign in. */
  recoverable: boolean;
}

const THROTTLE_MS = 3000;
let lastNoticeAt = 0;

export function notifySessionExpired(
  reason = 'Your session expired. A new guest session was created; please sign in to keep your account.',
  recoverable = true
): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastNoticeAt < THROTTLE_MS) return;
  lastNoticeAt = now;

  window.dispatchEvent(
    new CustomEvent<SessionExpiredDetail>(SESSION_EXPIRED_EVENT, {
      detail: { reason, recoverable },
    })
  );
}

export function subscribeToSessionExpired(
  handler: (detail: SessionExpiredDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    handler((event as CustomEvent<SessionExpiredDetail>).detail);
  };
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}
