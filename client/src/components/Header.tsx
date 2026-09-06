import React, { useState } from 'react';
import { RemoteUser } from '../types';
import { AuthUser } from '../hooks/useAuth';
import { AudioVisualizerBar } from './AudioVisualizerBar';
import {
  Share2,
  Users,
  Copy,
  Check,
  Radio,
  Wifi,
  WifiOff,
  User,
  Crown,
  Shield,
  Lock,
  Plus,
  LogIn,
  MicOff,
  VolumeX,
} from 'lucide-react';

interface HeaderProps {
  roomId: string | null;
  isSoloMode?: boolean;
  roomName?: string;
  creatorName?: string;
  currentUser: { id: string; name: string; color: string };
  users: Record<string, RemoteUser>;
  isConnected: boolean;
  isHost: boolean;
  canWrite?: boolean;
  isLocked?: boolean;
  authUser: AuthUser | null;
  onOpenAuthModal: () => void;
  onOpenCreateRoomModal: () => void;
  onOpenShareModal: () => void;
  onShareAndGoLive?: () => void;
  onOpenAdminModal: () => void;
  onUpdateUserName: (name: string) => void;
  onUpdateUserColor: (color: string) => void;
  onSwitchRoom: (newRoomId: string | null) => void;
  // Voice Chat
  isVoiceConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  volume: number;
  onSetVolume?: (v: number) => void;
  audioLevel: number;
  isSpeaking: boolean;
  frequencyData: Uint8Array;
  isSimulated: boolean;
  error: string | null;
  isIframeRestricted: boolean;
  activeSpeakers?: string[];
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleSimulated: () => void;
  onOpenInNewTab: () => void;
  onAudioLevelChange?: (level: number, isSpeaking: boolean) => void;
}

const PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const Header: React.FC<HeaderProps> = ({
  roomId,
  isSoloMode = false,
  roomName,
  creatorName,
  currentUser,
  users,
  isConnected,
  isHost,
  canWrite = true,
  isLocked = false,
  authUser,
  onOpenAuthModal,
  onOpenCreateRoomModal,
  onOpenShareModal,
  onShareAndGoLive,
  onOpenAdminModal,
  onUpdateUserName,
  onUpdateUserColor,
  onSwitchRoom,
  isVoiceConnected,
  isMuted,
  isDeafened,
  volume,
  onSetVolume,
  audioLevel,
  isSpeaking,
  frequencyData,
  isSimulated,
  error,
  isIframeRestricted,
  activeSpeakers = [],
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
  onToggleSimulated,
  onOpenInNewTab,
  onAudioLevelChange,
}) => {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState(currentUser.name);

  const activeUserList = Object.values(users) as RemoteUser[];

  return (
    <header
      id="whiteboard-header"
      className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-2 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none"
    >
      {/* Brand & Room Info */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm">
            W
          </div>
          <span className="font-semibold text-base sm:text-lg tracking-tight text-slate-900 hidden lg:block">
            Whiteboard
          </span>
        </div>

        {/* Room / Session Selector Button */}
        <div className="flex items-center gap-1.5">
          <button
            id="room-selector-btn"
            onClick={onOpenCreateRoomModal}
            className="text-xs font-semibold px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70 max-w-[130px] sm:max-w-[190px]"
            title={isSoloMode ? "Personal Canvas (Private). Click to browse sessions or create a room" : "Click to view sessions or create a new room"}
          >
            <span className="truncate">{isSoloMode ? 'Solo Canvas' : (roomName ? roomName : `room/${roomId}`)}</span>
            <Plus className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Connection status indicator */}
          <div
            title={isSoloMode ? 'Personal canvas (Private)' : (isConnected ? 'Connected to real-time sync' : 'Reconnecting...')}
            className="flex items-center gap-1 text-xs text-slate-500 font-medium"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSoloMode
                  ? 'bg-blue-400 ring-2 ring-blue-100'
                  : isConnected
                  ? 'bg-emerald-500 ring-2 ring-emerald-100'
                  : 'bg-rose-400 ring-2 ring-rose-100'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Audio Visualizer Center (Multiplayer only) */}
      {!isSoloMode && (
        <div className="flex items-center shrink-0">
          <AudioVisualizerBar
            isVoiceConnected={isVoiceConnected}
            isMuted={isMuted}
            isDeafened={isDeafened}
            volume={volume}
            onSetVolume={onSetVolume}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            frequencyData={frequencyData}
            isSimulated={isSimulated}
            error={error}
            isIframeRestricted={isIframeRestricted}
            activeSpeakers={activeSpeakers}
            onJoinVoice={onJoinVoice}
            onLeaveVoice={onLeaveVoice}
            onToggleMute={onToggleMute}
            onToggleDeafen={onToggleDeafen}
            onToggleSimulated={onToggleSimulated}
            onOpenInNewTab={onOpenInNewTab}
            onAudioLevelChange={onAudioLevelChange}
          />
        </div>
      )}

      {/* Actions: Admin Panel, Collaborators, Profile & Share */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Admin Controls Button (Visible for host in multiplayer, or when room has lock) */}
        {!isSoloMode && (isHost ? (
          <button
            id="admin-panel-btn"
            onClick={onOpenAdminModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors shadow-2xs cursor-pointer"
            title="Host Controls: Manage participant permissions and kick users"
          >
            <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500 shrink-0" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        ) : !canWrite ? (
          <button
            onClick={onOpenAdminModal}
            className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Your writing permission is currently revoked"
          >
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden md:inline">View-Only</span>
          </button>
        ) : null)}

        {/* Collaborators Avatar Stack (Multiplayer only) */}
        {!isSoloMode && (
          <div
            onClick={onOpenAdminModal}
            className="hidden sm:flex items-center -space-x-1.5 cursor-pointer"
            title="Click to view participants"
          >
            {activeUserList.slice(0, 3).map((u) => {
              const isMe = u.id === currentUser.id;
              const speaking = isMe ? isSpeaking : u.isSpeaking;
              const userMuted = isMe ? isMuted : u.isMuted;

              return (
                <div
                  key={u.id}
                  title={`${u.name}${isMe ? ' (You)' : ''}${u.isHost ? ' • Host' : ''}`}
                  style={{ backgroundColor: u.color }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-white text-[10px] sm:text-[11px] font-bold flex items-center justify-center border-2 border-white shadow-2xs relative ${
                    speaking ? 'ring-2 ring-blue-500 scale-105 z-10' : ''
                  }`}
                >
                  {u.name.slice(0, 2).toUpperCase()}
                  {u.isHost && (
                    <Crown className="w-2.5 h-2.5 text-amber-300 absolute -top-1 -right-1 fill-amber-300 drop-shadow" />
                  )}
                  {userMuted && (
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white flex items-center justify-center absolute -bottom-0.5 -right-0.5 z-20">
                      <MicOff className="w-1.5 h-1.5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
            {activeUserList.length > 3 && (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-2xs">
                +{activeUserList.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Auth / Account Profile Button */}
        {authUser ? (
          <button
            id="auth-profile-btn"
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
            title={`Signed in as ${authUser.email}`}
          >
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
              {authUser.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:inline truncate max-w-[85px]">{authUser.name}</span>
          </button>
        ) : (
          <button
            id="sign-in-prompt-btn"
            onClick={onOpenAuthModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            title="Sign in or register to save your rooms"
          >
            <LogIn className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}

        {/* User Appearance Customizer */}
        <button
          id="user-profile-btn"
          onClick={() => {
            setTempName(currentUser.name);
            setShowProfileModal(true);
          }}
          title="Customize your name and cursor color"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {/* Share Button / Share & Go Live */}
        {isSoloMode ? (
          <button
            id="share-go-live-btn"
            onClick={onShareAndGoLive}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md cursor-pointer active:scale-95 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-blue-500/20"
            title="Convert this solo canvas to a collaborative room and invite friends"
          >
            <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300 animate-pulse shrink-0" />
            <span className="font-bold">Share & Go Live</span>
          </button>
        ) : (
          <button
            id="share-room-modal-btn"
            onClick={onOpenShareModal}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer active:scale-95 bg-slate-900 text-white hover:bg-slate-800"
            title="Share room code or invite link"
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}
      </div>

      {/* User Profile Customizer Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="font-bold text-slate-900 text-base mb-1">Your Identity</h3>
            <p className="text-xs text-slate-500 mb-4">
              Collaborators in this session will see this name and cursor tag.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                maxLength={20}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Alex Doe"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Cursor & Avatar Color
              </label>
              <div className="flex gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => onUpdateUserColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                      currentUser.color === color
                        ? 'ring-2 ring-offset-2 ring-slate-800 scale-110'
                        : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onUpdateUserName(tempName);
                  setShowProfileModal(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
