import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_SDP_LENGTH,
  readIceCandidate,
  readSessionDescription,
} from './voiceSignaling';

test('voice offer rejects oversized SDP and drops nested payload fields (#76)', () => {
  const huge = {
    type: 'offer',
    sdp: 'v=0\r\n'.repeat(10_000),
    nested: { deep: { deeper: 'x'.repeat(1000) } },
  };
  assert.equal(huge.sdp.length > MAX_SDP_LENGTH, true);
  assert.equal(readSessionDescription(huge, 'offer'), null);

  const clean = readSessionDescription(
    { type: 'offer', sdp: 'v=0\r\n', nested: { deep: true } },
    'offer'
  );
  assert.deepEqual(clean, { type: 'offer', sdp: 'v=0\r\n' });
  assert.equal(readSessionDescription({ type: 'answer', sdp: 'v=0' }, 'offer'), null);
  assert.equal(readSessionDescription({ type: 'offer', sdp: 'a'.repeat(MAX_SDP_LENGTH) }, 'offer')?.sdp.length, MAX_SDP_LENGTH);
});

test('voice answer validates its type as well as its SDP (#76)', () => {
  assert.deepEqual(readSessionDescription({ type: 'answer', sdp: 'v=0' }, 'answer'), {
    type: 'answer',
    sdp: 'v=0',
  });
  assert.equal(readSessionDescription({ type: 'offer', sdp: 'v=0' }, 'answer'), null);
  assert.equal(readSessionDescription({ type: 'answer', sdp: 42 }, 'answer'), null);
});

test('invalid ICE candidates are rejected before relay (#76)', () => {
  assert.equal(readIceCandidate(null), null);
  assert.equal(readIceCandidate({ candidate: { type: 'host' } }), null);
  assert.equal(readIceCandidate({ candidate: 'x'.repeat(MAX_ICE_CANDIDATE_LENGTH + 1) }), null);
  assert.equal(readIceCandidate({ candidate: 'candidate:1', sdpMLineIndex: '0' }), null);
  assert.equal(readIceCandidate({ candidate: 'candidate:1', sdpMid: { id: 0 } }), null);
  assert.equal(readIceCandidate({ candidate: 'candidate:1', usernameFragment: 'u'.repeat(257) }), null);
});

test('valid ICE candidates are rebuilt as a flat bounded object (#76)', () => {
  const clean = readIceCandidate({
    candidate: 'candidate:1 1 udp 2130706431 203.0.113.1 54321 typ host',
    sdpMid: 'audio',
    sdpMLineIndex: 0,
    usernameFragment: 'frag',
    nested: { deep: true },
  });

  assert.deepEqual(clean, {
    candidate: 'candidate:1 1 udp 2130706431 203.0.113.1 54321 typ host',
    sdpMid: 'audio',
    sdpMLineIndex: 0,
    usernameFragment: 'frag',
  });
  assert.deepEqual(readIceCandidate({ candidate: '' }), {
    candidate: '',
    sdpMid: null,
    sdpMLineIndex: null,
    usernameFragment: null,
  });
});
