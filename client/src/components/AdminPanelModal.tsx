import React, { useState } from 'react';
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
} from 'lucide-react';
import { RemoteUser } from '../types';

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
}) => {
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);

  if (!isOpen) return null;

  const userList = Object.values(users) as RemoteUser[];

  return (
    <div
      id="admin-panel-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="admin-panel-modal-dialog"
        className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Session Admin & Privileges</h2>
                {isHost ? (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-full">
                    👑 Host / Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full">
                    Participant
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {isHost
                  ? 'Manage permissions, revoke writing access, or remove users'
                  : `Administered by ${creatorName || 'Room Host'}`}
              </p>
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
          {/* Global Whiteboard Lock Toggle (Admin only) */}
          {isHost ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    isLocked ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {isLocked ? 'Whiteboard Locked (View-Only)' : 'Whiteboard Unlocked'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isLocked
                      ? 'All non-admin participants are restricted to read-only'
                      : 'Participants can write according to individual permissions'}
                  </div>
                </div>
              </div>
              <button
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
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-indigo-500 shrink-0" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-900">{roomName || 'This room'}</span> is managed by{' '}
                <span className="font-medium text-slate-800">{creatorName || 'the session host'}</span>. Only the host
                can alter member permissions or remove participants.
              </div>
            </div>
          )}

          {/* Participant List */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Room Participants ({userList.length})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-normal">Active in real-time</span>
            </div>

            <div className="space-y-2">
              {userList.map((u) => {
                const isUserSelf = u.id === currentUserId;
                const isUserHost = !!u.isHost || u.role === 'admin';
                const canUserWrite = u.canWrite !== false;

                return (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/50 flex items-center justify-between gap-3 transition-colors"
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
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full flex items-center justify-center text-[8px] text-slate-900 font-bold border border-white shadow-xs"
                          >
                            👑
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-900 truncate">{u.name}</span>
                          {isUserSelf && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          {isUserHost ? (
                            <span className="text-indigo-600 font-medium flex items-center gap-0.5">
                              <Crown className="w-3 h-3" /> Admin
                            </span>
                          ) : canUserWrite ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" /> Can Write
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium flex items-center gap-0.5">
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
                            onClick={() => onSetPermission(u.id, !canUserWrite)}
                            title={canUserWrite ? 'Revoke writing permission' : 'Grant writing permission'}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                              canUserWrite
                                ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
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
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  onKickUser(u.id, 'Removed by room host');
                                  setConfirmKickId(null);
                                }}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                              >
                                Confirm Kick
                              </button>
                              <button
                                onClick={() => setConfirmKickId(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmKickId(u.id)}
                              title="Remove user from room"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 px-2 py-1">
                          {isUserHost ? 'Host' : canUserWrite ? 'Editor' : 'Viewer'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
