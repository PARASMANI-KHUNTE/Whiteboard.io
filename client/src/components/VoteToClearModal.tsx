import React, { useEffect, useState } from 'react';
import { VoteToClearState } from '../types';
import { AlertTriangle, Check, X, Clock } from 'lucide-react';

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
  const [secondsLeft, setSecondsLeft] = useState(15);

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
      className="fixed bottom-24 right-6 z-50 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-5 text-slate-900 animate-in fade-in slide-in-from-bottom-4 duration-200 select-none"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-tight text-slate-400">
          Action Required
        </span>
        <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded-full">
          {yesCount}/{vote.totalEligible} Voted
        </span>
      </div>

      <h4 className="text-sm font-semibold text-slate-900 mb-1">Clear all canvas objects?</h4>
      <p className="text-xs text-slate-500 mb-3">
        Requested by <span className="font-medium text-slate-700">{vote.initiatorName}</span> ({secondsLeft}s left)
      </p>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 h-2 rounded-full mb-4 overflow-hidden">
        <div
          className="bg-rose-500 h-full transition-all duration-500"
          style={{ width: `${(yesCount / Math.max(1, vote.totalEligible)) * 100}%` }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          id="vote-yes-btn"
          onClick={() => onCastVote(true)}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
            userVote === true
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {userVote === true ? 'VOTED YES' : 'VOTE YES'}
        </button>

        <button
          id="vote-no-btn"
          onClick={() => {
            if (isInitiator) {
              onCancelVote();
            } else {
              onCastVote(false);
            }
          }}
          className={`flex-1 py-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold rounded-lg transition-all cursor-pointer active:scale-95 ${
            userVote === false ? 'ring-2 ring-slate-400' : ''
          }`}
        >
          {isInitiator ? 'CANCEL' : userVote === false ? 'VOTED NO' : 'KEEP'}
        </button>
      </div>
    </div>
  );
};
