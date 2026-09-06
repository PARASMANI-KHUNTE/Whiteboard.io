import React, { useState } from 'react';
import { X, Plus, Sparkles, Lock, ArrowRight, Layers } from 'lucide-react';
import { SessionRoom } from '../types';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  myRooms?: SessionRoom[];
  onCreateRoom: (params: { name: string; customCode?: string; isLocked?: boolean }) => Promise<{ success: boolean; room?: SessionRoom; error?: string }>;
  onJoinRoom?: (roomId: string) => void;
  onSelectRoom?: (roomId: string) => void;
  onFetchRooms?: () => Promise<any>;
  currentRoomId: string;
  currentUserId?: string;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  myRooms = [],
  onCreateRoom,
  onJoinRoom,
  onSelectRoom,
  currentRoomId,
}) => {
  const [roomName, setRoomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    code += '-';
    for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setCustomCode(code);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError('Please provide a name for your session room.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const res = await onCreateRoom({
      name: roomName.trim(),
      customCode: customCode.trim() || undefined,
      isLocked,
    });
    setIsSubmitting(false);

    if (!res.success || !res.room) {
      setError(res.error || 'Failed to create room.');
    } else {
      (onSelectRoom || onJoinRoom)?.(res.room.id);
      onClose();
    }
  };

  return (
    <div
      id="create-room-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="create-room-modal-dialog"
        className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Create Session Room</h2>
              <p className="text-xs text-slate-500">Host your own collaborative session with full admin privileges</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Session Room Title</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Product Architecture Review"
                required
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Room Code (Share Identifier)</label>
                <button
                  type="button"
                  onClick={generateRandomCode}
                  className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate Code
                </button>
              </div>
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                placeholder="e.g. SPRINT-99 or leave blank for auto"
                className="w-full px-3 py-2 text-xs font-mono tracking-wider uppercase border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Share this short code with your team so they can quickly join from any device.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-900">Start in View-Only Mode</div>
                  <div className="text-[11px] text-slate-500">
                    Participants can watch live; you can grant write permissions individually.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Creating Session...' : 'Create & Enter Room'}
            </button>
          </form>

          {/* Existing Rooms List */}
          {(myRooms || []).length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Your Created Sessions ({(myRooms || []).length})</span>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {(myRooms || []).map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      currentRoomId === r.id
                        ? 'bg-blue-50/70 border-blue-200'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-slate-900 truncate">{r.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">Code: {r.id}</div>
                    </div>
                    {currentRoomId === r.id ? (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          (onSelectRoom || onJoinRoom)?.(r.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>Switch</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
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
