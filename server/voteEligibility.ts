export interface VoteEligibilityUser {
  id: string;
  isHost?: boolean;
  canWrite?: boolean;
}

export interface VoteEligibilityRoom {
  users: Record<string, VoteEligibilityUser>;
  voteToClear: VoteEligibilityVote | null;
}

export interface VoteEligibilityVote {
  active: boolean;
  votes: Record<string, boolean>;
  totalEligible: number;
}

/** Only participants that can actually vote count toward the quorum (#69). */
export function getEligibleVoterIds(room: VoteEligibilityRoom): string[] {
  return Object.values(room.users)
    .filter((user) => user.isHost === true || user.canWrite === true)
    .map((user) => user.id);
}

/** Remove votes from users who left, were kicked, or lost write access. */
export function pruneVoteEligibility(vote: VoteEligibilityVote, room: VoteEligibilityRoom): void {
  const eligible = new Set(getEligibleVoterIds(room));
  for (const userId of Object.keys(vote.votes)) {
    if (!eligible.has(userId)) delete vote.votes[userId];
  }
  vote.totalEligible = eligible.size;
}

export function tallyVote(
  room: VoteEligibilityRoom,
  vote: VoteEligibilityVote
): { yesCount: number; totalEligible: number; passed: boolean } {
  pruneVoteEligibility(vote, room);
  const yesCount = Object.values(vote.votes).filter(Boolean).length;
  const totalEligible = vote.totalEligible;
  return {
    yesCount,
    totalEligible,
    passed: totalEligible > 0 && yesCount > totalEligible / 2,
  };
}
