import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Shield,
  ShieldAlert,
  UserX,
  Lock,
  Unlock,
  CheckCircle,
  Ban,
  Crown,
  Users,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { RemoteUser } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: Record<string, RemoteUser>;
  currentUserId: string;
  isHost: boolean;
  isLocked: boolean;
  roomId?: string;
  roomName?: string;
  creatorName?: string;
  onSetPermission: (targetUserId: string, canWrite: boolean) => void;
  onKickUser: (targetUserId: string, reason?: string) => void;
  onToggleLock: (isLocked: boolean) => void;
  onDeleteRoom?: (roomId: string) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUserId,
  isHost,
  isLocked,
  roomId,
  roomName,
  creatorName,
  onSetPermission,
  onKickUser,
  onToggleLock,
  onDeleteRoom,
}) => {
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(false);

  // Reset destructive-confirmation state whenever the panel is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setConfirmKickId(null);
      setKickReason('');
      setConfirmDeleteRoom(false);
    }
  }, [isOpen]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

  const userList = Object.values(users) as RemoteUser[];

  return (
    <div
      id="admin-panel-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id="admin-panel-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-panel-modal-title"
        tabIndex={-1}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="admin-panel-modal-title" className="text-sm font-semibold text-slate-900 dark:text-white">Session Admin & Privileges</h2>
                {isHost ? (
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold rounded-full">
                    👑 Host / Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded-full">
                    Participant
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isHost
                  ? `Room ${roomId || ''} • Manage permissions, writing access, or remove users`
                  : `Room ${roomId || ''} • Administered by ${creatorName || 'Room Host'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close admin panel"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Global Whiteboard Lock Toggle (Admin only) */}
          {isHost ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    isLocked
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {isLocked ? 'Whiteboard Locked (View-Only)' : 'Whiteboard Unlocked'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isLocked
                      ? 'All non-admin participants are restricted to read-only'
                      : 'Participants can write according to individual permissions'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleLock(!isLocked)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs ${
                  isLocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {isLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Board</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Board</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white">{roomName || 'This room'}</span> is managed by{' '}
                <span className="font-medium text-slate-800 dark:text-slate-200">{creatorName || 'the session host'}</span>. Only the host
                can alter member permissions or remove participants.
              </div>
            </div>
          )}

          {/* Participant List */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Room Participants ({userList.length})</span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">Active in real-time</span>
            </div>

            <div className="space-y-2">
              {userList.map((u) => {
                const isUserSelf = u.id === currentUserId;
                const isUserHost = !!u.isHost || u.role === 'admin';
                const canUserWrite = u.canWrite !== false;

                return (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition-colors"
                  >
                    {/* User Identity */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs relative"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                        {isUserHost && (
                          <span
                            title="Session Host"
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full flex items-center justify-center text-[8px] text-slate-900 font-bold border border-white dark:border-slate-900 shadow-xs"
                          >
                            👑
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{u.name}</span>
                          {isUserSelf && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {isUserHost ? (
                            <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-0.5">
                              <Crown className="w-3 h-3" /> Admin
                            </span>
                          ) : canUserWrite ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" /> Can Write
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                              <Ban className="w-3 h-3" /> View Only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isHost && !isUserHost ? (
                        <>
                          {/* Revoke / Grant Write Permission */}
                          <button
                            type="button"
                            onClick={() => onSetPermission(u.id, !canUserWrite)}
                            aria-label={canUserWrite ? `Revoke writing permission for ${u.name}` : `Grant writing permission to ${u.name}`}
                            title={canUserWrite ? 'Revoke writing permission' : 'Grant writing permission'}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                              canUserWrite
                                ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950/80 border-amber-200 dark:border-amber-900/70'
                                : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 border-emerald-200 dark:border-emerald-900/70'
                            }`}
                          >
                            {canUserWrite ? (
                              <>
                                <Ban className="w-3 h-3" />
                                <span className="hidden sm:inline">Revoke</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                <span className="hidden sm:inline">Allow Write</span>
                              </>
                            )}
                          </button>

                          {/* Kick User */}
                          {confirmKickId === u.id ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <label htmlFor={`kick-reason-${u.id}`} className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                Reason (optional)
                              </label>
                              <input
                                id={`kick-reason-${u.id}`}
                                type="text"
                                value={kickReason}
                                maxLength={120}
                                autoFocus
                                placeholder="Removed by room host"
                                onChange={(e) => setKickReason(e.target.value)}
                                className="w-44 px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onKickUser(u.id, kickReason.trim() || 'Removed by room host');
                                    setConfirmKickId(null);
                                    setKickReason('');
                                  }}
                                  className="px-2 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                                >
                                  Confirm Kick
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancel kick confirmation"
                                  onClick={() => {
                                    setConfirmKickId(null);
                                    setKickReason('');
                                  }}
                                  className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove ${u.name} from room`}
                              onClick={() => {
                                setKickReason('');
                                setConfirmKickId(u.id);
                              }}
                              title="Remove user from room"
                              className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 px-2 py-1">
                          {isUserHost ? 'Host' : canUserWrite ? 'Editor' : 'Viewer'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Danger Zone: Delete Room (Host only) */}
          {isHost && (
            <div className="p-4 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                    Danger Zone: Delete Room
                  </div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                    Permanently delete this whiteboard session and all drawings. All participants will be disconnected immediately.
                  </div>
                </div>
              </div>

              {confirmDeleteRoom ? (
                <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      if (roomId) onDeleteRoom?.(roomId);
                      setConfirmDeleteRoom(false);
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Room Permanently</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRoom(false)}
                    className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteRoom(true)}
                  className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 hover:border-rose-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Room</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
