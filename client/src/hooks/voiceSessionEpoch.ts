/** Identity of a voice capture attempt, used to reject late getUserMedia results. */
export interface VoiceSessionToken {
  epoch: number;
  roomId: string | null;
}

export function captureVoiceSession(epoch: number, roomId: string | null): VoiceSessionToken {
  return { epoch, roomId };
}

/** A microphone stream may only activate if its room and epoch still match. */
export function isVoiceSessionCurrent(
  current: VoiceSessionToken,
  started: VoiceSessionToken
): boolean {
  return current.epoch === started.epoch && current.roomId === started.roomId;
}

/**
 * Invalidate every in-flight voice capture. The next getUserMedia result will
 * fail the epoch check and stop its tracks instead of going live.
 */
export function invalidateVoiceSession(epochRef: { current: number }): number {
  epochRef.current += 1;
  return epochRef.current;
}
