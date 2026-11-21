/**
 * A direct (non-voted) board clear is only safe when it cannot destroy other
 * people's work: either the caller is the room host, or nobody else is present.
 */
export function canDirectClearBoard(participantCount: number, isHost: boolean): boolean {
  if (!Number.isFinite(participantCount) || participantCount < 1) return false;
  return isHost || participantCount === 1;
}
