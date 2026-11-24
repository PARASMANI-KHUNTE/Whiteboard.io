import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  captureVoiceSession,
  invalidateVoiceSession,
  isVoiceSessionCurrent,
} from '../client/src/hooks/voiceSessionEpoch';

function callbackBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(() => {`);
  assert.notEqual(start, -1, `${name} callback not found`);
  const end = source.indexOf('\n  }, [', start);
  assert.notEqual(end, -1, `${name} callback end not found`);
  return source.slice(start, end);
}

test('invalidating a voice session rejects an in-flight microphone grant (#78)', () => {
  const epochRef = { current: 4 };
  const started = captureVoiceSession(epochRef.current, 'room-a');

  assert.equal(isVoiceSessionCurrent(captureVoiceSession(epochRef.current, 'room-a'), started), true);

  assert.equal(invalidateVoiceSession(epochRef), 5);
  assert.equal(isVoiceSessionCurrent(captureVoiceSession(epochRef.current, 'room-a'), started), false);
});

test('a room change also invalidates a captured microphone session (#78)', () => {
  const epochRef = { current: 1 };
  const started = captureVoiceSession(epochRef.current, 'room-a');

  invalidateVoiceSession(epochRef);
  assert.equal(isVoiceSessionCurrent(captureVoiceSession(epochRef.current, 'room-b'), started), false);
});

test('leave and simulation toggle invalidate pending captures (#78)', () => {
  const source = readFileSync(
    new URL('../client/src/hooks/useVoiceChat.ts', import.meta.url),
    'utf8'
  );

  assert.match(callbackBody(source, 'leaveVoiceChat'), /invalidateVoiceSession\(voiceEpochRef\)/);
  assert.match(callbackBody(source, 'toggleSimulated'), /invalidateVoiceSession\(voiceEpochRef\)/);
});
