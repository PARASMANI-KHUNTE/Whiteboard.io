export interface HostCandidate {
  id: string;
  name: string;
  isHost?: boolean;
  canWrite?: boolean;
  role?: 'admin' | 'editor' | 'viewer';
}

/**
 * Choose the participant who should inherit an empty room ownership slot.
 *
 * Ownership is only considered vacant when the departing participant is the
 * recorded creator (or no creator has been recorded yet). This prevents a
 * non-owner host flag left over from a stale client from stealing ownership
 * while the real creator is still present.
 */
export function chooseReplacementHost<T extends HostCandidate>(
  users: Record<string, T>,
  departingUserId: string,
  creatorId: string
): T | null {
  if (creatorId && creatorId !== departingUserId) return null;

  const candidateId = Object.keys(users).find((id) => id && id !== departingUserId && users[id]);
  if (!candidateId) return null;
  return users[candidateId];
}
