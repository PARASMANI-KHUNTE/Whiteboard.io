import React, { useEffect, useState } from 'react';
import { VoteToClearState } from '../types';

interface VoteToClearModalProps {
  vote: VoteToClearState;
  currentUserId: string;
  onCastVote: (vote: boolean) => void;
  onCancelVote: () => void;
}

export const VoteToClearModal: React.FC<VoteToClearModalProps> = ({
  vote,
  currentUserId,
  onCastVote,
  onCancelVote,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, Math.ceil(vote.durationMs / 1000)));

  useEffect(() => {
    const updateCountdown = () => {
      const elapsed = Date.now() - vote.startedAt;
      const remaining = Math.max(0, Math.ceil((vote.durationMs - elapsed) / 1000));
      setSecondsLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [vote.startedAt, vote.durationMs]);

  const userVote = vote.votes[currentUserId];
  const isInitiator = vote.initiatorId === currentUserId;
  const yesCount = Object.values(vote.votes).filter(Boolean).length;
  const noCount = Object.values(vote.votes).filter((v) => v === false).length;
  const requiredVotes = Math.floor(vote.totalEligible / 2) + 1;

  return (
    <div
      id="vote-to-clear-banner"
      role="group"
      aria-label="Vote to clear whiteboard"
      className="fixed bottom-24 right-3 sm:right-6 z-30 w-[min(18rem,calc(100vw-1.5rem))] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-5 text-slate-900 dark:text-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-200 select-none wb-bottom-chat-aware wb-bottom-vote"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500">
          Action Required
        </span>
        <span className="text-xs font-semibold text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-0.5 rounded-full">
          {yesCount}Y / {noCount}N ({requiredVotes} to pass)
        </span>
      </div>

      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Clear all canvas objects?</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Requested by <span className="font-medium text-slate-700 dark:text-slate-200">{vote.initiatorName}</span> ({secondsLeft}s left)
      </p>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mb-4 overflow-hidden">
        <div
          className="bg-rose-500 h-full transition-all duration-500"
          style={{ width: `${(yesCount / Math.max(1, vote.totalEligible)) * 100}%` }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          id="vote-yes-btn"
          aria-pressed={userVote === true}
          onClick={() => onCastVote(true)}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
            userVote === true
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
              : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600'
          }`}
        >
          {userVote === true ? 'VOTED YES' : 'VOTE YES'}
        </button>

        <button
          type="button"
          id="vote-no-btn"
          aria-pressed={userVote === false}
          onClick={() => {
            if (isInitiator) {
              onCancelVote();
            } else {
              onCastVote(false);
            }
          }}
          className={`flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer active:scale-95 ${
            userVote === false ? 'ring-2 ring-slate-400 dark:ring-slate-500' : ''
          }`}
        >
          {isInitiator ? 'CANCEL' : userVote === false ? 'VOTED NO' : 'KEEP'}
        </button>
      </div>
    </div>
  );
};
