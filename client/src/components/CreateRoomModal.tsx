import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Lock, Unlock, Hash, ArrowRight, Trash2 } from 'lucide-react';
import { SessionRoom } from '../types';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoomId: string | null;
  currentUserId: string;
  myRooms?: SessionRoom[];
  onSelectRoom?: (roomId: string) => void;
  onJoinRoom?: (roomId: string) => void;
  onDeleteRoom?: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  onCreateRoom: (data: { name: string; customCode?: string; isLocked?: boolean }) => Promise<{ success: boolean; room?: SessionRoom; error?: string }>;
  onFetchRooms?: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  currentRoomId,
  myRooms = [],
  onSelectRoom,
  onJoinRoom,
  onDeleteRoom,
  onCreateRoom,
}) => {
  const [roomName, setRoomName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError('Please provide a room title');
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

  return createPortal(
    <div
      id="create-room-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="create-room-modal-dialog"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Create Session Room</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Host your own collaborative session with full admin privileges</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Room Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Design Sprint #4"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom Join Code (Optional)
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g. sprint-team-alpha"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 dark:text-white"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Leave empty to generate a random 8-character code.</p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  {isLocked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                  <span>Lock Canvas on Entry</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Only you will be able to draw until you grant permission.</p>
              </div>
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create & Join Room'}
              </button>
            </div>
          </form>

          {/* Existing Rooms List */}
          {myRooms.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Your Saved Rooms</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {myRooms.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      currentRoomId === r.id
                        ? 'bg-blue-50/70 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900'
                        : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-700/80'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-slate-900 dark:text-white truncate">{r.name}</div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">Code: {r.id}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {currentRoomId === r.id ? (
                        <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            (onSelectRoom || onJoinRoom)?.(r.id);
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>Switch</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* Delete room button */}
                      {confirmDeleteId === r.id ? (
                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                          <button
                            onClick={async () => {
                              setIsDeletingId(r.id);
                              await onDeleteRoom?.(r.id);
                              setIsDeletingId(null);
                              setConfirmDeleteId(null);
                            }}
                            disabled={isDeletingId === r.id}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            {isDeletingId === r.id ? '...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(r.id)}
                          title="Delete this room"
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
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
