import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PEER_RECOVERY_TIMEOUT_MS,
  isCurrentPeerConnection,
  shouldStartPeerRecovery,
  shouldTearDownPeer,
  shouldTearDownPeerAfterRecovery,
} from '../client/src/hooks/voicePeerLifecycle';

function fakePeer(): RTCPeerConnection {
  return {} as RTCPeerConnection;
}

test('stale peer callbacks cannot mutate a replacement connection (#77)', () => {
  const oldPeer = fakePeer();
  const replacement = fakePeer();
  const connections: Record<string, RTCPeerConnection> = { peer: replacement };

  assert.equal(isCurrentPeerConnection(connections, 'peer', oldPeer), false);
  assert.equal(isCurrentPeerConnection(connections, 'peer', replacement), true);
  assert.equal(isCurrentPeerConnection(connections, 'missing', replacement), false);
});

test('transient disconnect starts recovery instead of tearing the peer down (#77)', () => {
  assert.equal(PEER_RECOVERY_TIMEOUT_MS > 0, true);
  assert.equal(shouldStartPeerRecovery('disconnected'), true);
  assert.equal(shouldStartPeerRecovery('connected'), false);
  assert.equal(shouldTearDownPeer('disconnected', false), false);

  // A failed peer that is already restarting ICE gets the grace period too.
  assert.equal(shouldTearDownPeer('failed', true), false);
  assert.equal(shouldTearDownPeer('failed', false), true);
  assert.equal(shouldTearDownPeer('closed', true), true);
});

test('only an unrecovered peer is removed after the recovery window (#77)', () => {
  assert.equal(shouldTearDownPeerAfterRecovery('connected'), false);
  assert.equal(shouldTearDownPeerAfterRecovery('connecting'), false);
  assert.equal(shouldTearDownPeerAfterRecovery('new'), false);
  assert.equal(shouldTearDownPeerAfterRecovery('disconnected'), true);
  assert.equal(shouldTearDownPeerAfterRecovery('failed'), true);
  assert.equal(shouldTearDownPeerAfterRecovery('closed'), true);
});
