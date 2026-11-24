/** How long a disconnected peer is given to recover before it is torn down. */
export const PEER_RECOVERY_TIMEOUT_MS = 3000;

/**
 * Peer callbacks are asynchronous. Only the connection currently installed in
 * the registry is allowed to mutate shared state; otherwise a closed pc1 can
 * delete its pc2 replacement.
 */
export function isCurrentPeerConnection(
  connections: Record<string, RTCPeerConnection>,
  userId: string,
  pc: RTCPeerConnection
): boolean {
  return connections[userId] === pc;
}

/** A brief disconnect is recoverable and must not tear the peer down. */
export function shouldStartPeerRecovery(state: RTCPeerConnectionState): boolean {
  return state === 'disconnected';
}

/**
 * Decide what a connection state change should do. A `failed` peer is given a
 * grace period when an ICE restart is already in progress; without one it is
 * terminal. `closed` is always terminal.
 */
export function shouldTearDownPeer(
  state: RTCPeerConnectionState,
  recoveryInProgress: boolean
): boolean {
  if (state === 'closed') return true;
  if (state === 'failed') return !recoveryInProgress;
  return false;
}

/** At recovery timeout, only an actually recovered peer survives. */
export function shouldTearDownPeerAfterRecovery(state: RTCPeerConnectionState): boolean {
  return state === 'disconnected' || state === 'failed' || state === 'closed';
}
