import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEligibleVoterIds,
  pruneVoteEligibility,
  tallyVote,
  type VoteEligibilityRoom,
  type VoteEligibilityVote,
} from './voteEligibility';

function vote(overrides: Partial<VoteEligibilityVote> = {}): VoteEligibilityVote {
  return { active: true, votes: {}, totalEligible: 0, ...overrides };
}

function room(
  users: VoteEligibilityRoom['users'],
  activeVote: VoteEligibilityVote
): VoteEligibilityRoom {
  return { users, voteToClear: activeVote };
}

test('a kicked user’s stale yes vote is removed from the tally (#69)', () => {
  const activeVote = vote({ votes: { host: true, kicked: true, voter: false } });
  const currentRoom = room(
    {
      host: { id: 'host', isHost: true, canWrite: true },
      voter: { id: 'voter', canWrite: true },
    },
    activeVote
  );

  const result = tallyVote(currentRoom, activeVote);

  assert.equal(result.totalEligible, 2);
  assert.equal(result.yesCount, 1);
  assert.equal(result.passed, false);
  assert.deepEqual(Object.keys(activeVote.votes).sort(), ['host', 'voter']);
  assert.deepEqual(getEligibleVoterIds(currentRoom).sort(), ['host', 'voter']);
});

test('viewers do not count toward the quorum in a locked room (#69)', () => {
  const activeVote = vote({ votes: { host: true } });
  const currentRoom = room(
    {
      host: { id: 'host', isHost: true, canWrite: true },
      viewer1: { id: 'viewer1', canWrite: false },
      viewer2: { id: 'viewer2', canWrite: false },
    },
    activeVote
  );

  const result = tallyVote(currentRoom, activeVote);

  assert.equal(result.totalEligible, 1);
  assert.equal(result.yesCount, 1);
  assert.equal(result.passed, true);
});

test('revoking write access discards that user’s vote', () => {
  const activeVote = vote({ votes: { host: true, editor: true } });
  const currentRoom = room(
    {
      host: { id: 'host', isHost: true, canWrite: true },
      editor: { id: 'editor', canWrite: false },
    },
    activeVote
  );

  pruneVoteEligibility(activeVote, currentRoom);

  assert.deepEqual(activeVote.votes, { host: true });
  assert.equal(activeVote.totalEligible, 1);
});

test('an empty eligible set can never produce a passed vote', () => {
  const activeVote = vote({ votes: { ghost: true } });
  const currentRoom = room({}, activeVote);

  const result = tallyVote(currentRoom, activeVote);

  assert.equal(result.totalEligible, 0);
  assert.equal(result.passed, false);
});
