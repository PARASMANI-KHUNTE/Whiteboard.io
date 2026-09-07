import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AuthUser, SessionRoom } from '../types';
import { Users, Palette, Sparkles, ArrowRight, Hash, LogIn } from 'lucide-react';

interface SessionLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: AuthUser | null;
  myRooms?: SessionRoom[];
  onStartSolo: () => void;
  onOpenCreateRoom: () => void;
  onJoinRoomByCode: (code: string) => void;
}

export const SessionLauncherModal: React.FC<SessionLauncherModalProps> = ({
  isOpen,
  authUser,
  myRooms = [],
  onStartSolo,
  onOpenCreateRoom,
  onJoinRoomByCode,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (clean.length < 2) {
      setJoinError('Please enter a valid room code.');
      return;
    }
    setJoinError(null);
    onJoinRoomByCode(clean);
  };

  return createPortal(
    <div
      id="session-launcher-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="session-launcher-dialog"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100"
      >
        {/* Header Banner */}
        <div className="p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20">
              W
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Whiteboard Workspace
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1">
            Welcome, {authUser?.name || 'Artist'}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md">
            Choose how you would like to work today. You can start alone or create a collaborative room.
          </p>
        </div>

        {/* Action Modes Grid */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Solo Mode Card */}
            <div
              onClick={onStartSolo}
              className="group p-5 rounded-2xl border-2 border-slate-200/90 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 bg-white dark:bg-slate-800/60 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Palette className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                  Draw Solo (Personal)
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Start privately on a clean canvas. You can convert to a live multiplayer room at any time with 1 click.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-700">
                <span>Start Alone</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Collaborative Room Card */}
            <div
              onClick={onOpenCreateRoom}
              className="group p-5 rounded-2xl border-2 border-slate-200/90 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/5 bg-white dark:bg-slate-800/60 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                  Create Room
                  <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md">
                    Multiplayer
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Start an online session with real-time multi-user drawing, live cursors, and voice chat.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700">
                <span>Create & Invite</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Or Join Existing by Code */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <form onSubmit={handleJoinSubmit} className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value);
                    setJoinError(null);
                  }}
                  placeholder="Or enter room code to join..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Join Room</span>
              </button>
            </form>
            {joinError && <p className="text-[11px] text-rose-500 mt-1.5">{joinError}</p>}
          </div>

          {/* Quick-list of existing rooms */}
          {myRooms.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Recently Created Rooms
              </span>
              <div className="flex flex-wrap gap-2">
                {myRooms.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onJoinRoomByCode(r.id)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{r.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">({r.id})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
