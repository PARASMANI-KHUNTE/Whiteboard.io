import React, { useState } from 'react';
import { Palette, Users, ArrowRight, Sparkles, Hash, Layers, Clock, Lock } from 'lucide-react';
import { SessionRoom, AuthUser } from '../types';

interface SessionLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: AuthUser | null;
  myRooms: SessionRoom[];
  onStartSolo: () => void;
  onOpenCreateRoom: () => void;
  onJoinRoomByCode: (code: string) => void;
  onSelectSavedRoom: (roomId: string) => void;
}

export const SessionLauncherModal: React.FC<SessionLauncherModalProps> = ({
  isOpen,
  authUser,
  myRooms = [],
  onStartSolo,
  onOpenCreateRoom,
  onJoinRoomByCode,
  onSelectSavedRoom,
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

  return (
    <div
      id="session-launcher-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="session-launcher-dialog"
        className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
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
              className="group p-5 rounded-2xl border-2 border-slate-200/90 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 bg-white transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Palette className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  Draw Solo (Personal)
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Start privately on a clean canvas. You can convert to a live multiplayer room at any time with 1 click.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600 group-hover:text-blue-700">
                <span>Start Alone</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Collaborative Room Card */}
            <div
              onClick={onOpenCreateRoom}
              className="group p-5 rounded-2xl border-2 border-slate-200/90 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/5 bg-white transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  Create Room
                  <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                    Multiplayer
                  </span>
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Start an online session with real-time multi-user drawing, live cursors, and voice chat.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
                <span>Create & Invite</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Join with Code Inline Bar */}
          <form onSubmit={handleJoinSubmit} className="pt-2">
            <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              Have an invitation code?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="e.g. AFT-9AU or TEAM-ROOM"
                className="flex-1 px-3.5 py-2 text-xs uppercase tracking-wider border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Join Board
              </button>
            </div>
            {joinError && <p className="text-[11px] text-rose-600 mt-1">{joinError}</p>}
          </form>

          {/* My Saved Rooms (MongoDB) */}
          {myRooms && myRooms.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Your Saved Rooms in MongoDB ({myRooms.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {myRooms.slice(0, 4).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => onSelectSavedRoom(r.id)}
                    className="p-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200/80 rounded-xl cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600">
                        {r.name}
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Code: {r.id}</span>
                        {r.isLocked && <Lock className="w-2.5 h-2.5 text-amber-500 ml-1" />}
                      </p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
