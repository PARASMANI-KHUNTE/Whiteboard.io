import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { RemoteUser } from '../types';
import { AuthUser } from '../hooks/useAuth';
import { AudioVisualizerBar } from './AudioVisualizerBar';
import {
  Share2,
  Radio,
  Crown,
  Shield,
  Lock,
  Plus,
  LogIn,
  LogOut,
  MicOff,
  Sun,
  Moon,
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
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  creatorName: _creatorName,
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
  onSwitchRoom: _onSwitchRoom,
  onLogout,
  theme,
  onToggleTheme,
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
      className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs px-2 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none transition-colors"
    >
      {/* Brand & Room Info */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm">
            W
          </div>
          <span className="font-semibold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white hidden lg:block">
            Whiteboard
          </span>
        </div>

        {/* Room / Session Selector Button */}
        <div className="flex items-center gap-1.5">
          <button
            id="room-selector-btn"
            onClick={onOpenCreateRoomModal}
            className="text-xs font-semibold px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 rounded-xl text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70 dark:border-slate-700 max-w-[130px] sm:max-w-[190px]"
            title={isSoloMode ? "Personal Canvas (Private). Click to browse sessions or create a room" : "Click to view sessions or create a new room"}
          >
            <span className="truncate">{isSoloMode ? 'Solo Canvas' : (roomName ? roomName : `room/${roomId}`)}</span>
            <Plus className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Connection status indicator */}
          <div
            title={isSoloMode ? 'Personal canvas (Private)' : (isConnected ? 'Connected to real-time sync' : 'Reconnecting...')}
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSoloMode
                  ? 'bg-blue-400 ring-2 ring-blue-100 dark:ring-blue-900/50'
                  : isConnected
                  ? 'bg-emerald-500 ring-2 ring-emerald-100 dark:ring-emerald-900/50'
                  : 'bg-amber-500 ring-2 ring-amber-100 dark:ring-amber-900/50 animate-pulse'
              }`}
            />
            <span className="hidden xl:inline">
              {isSoloMode ? 'Offline/Private' : isConnected ? 'Live' : 'Syncing'}
            </span>
          </div>

          {/* Locked / Read-Only indicator badge */}
          {isLocked && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[11px] font-semibold"
              title="Room is locked by host. Drawing is disabled for participants."
            >
              <Lock className="w-3 h-3" />
              <span className="hidden md:inline">Locked</span>
            </div>
          )}

          {!canWrite && !isLocked && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold"
              title="Writing permission revoked by host"
            >
              <span>View Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Voice Chat & Audio Visualizer Bar */}
      <div className="flex items-center gap-2">
        <AudioVisualizerBar
          roomId={roomId}
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

      {/* Right Action Tools: Admin, Theme, Users, Profile & Share */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Host Admin Panel Button */}
        {isHost && (
          <button
            id="admin-panel-toggle-btn"
            onClick={onOpenAdminModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-semibold transition-colors cursor-pointer"
            title="Room Host Admin Settings"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {/* Dark / Light Theme Toggle */}
        <button
          id="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Active Collaborators Avatars */}
        {activeUserList.length > 0 && (
          <div className="hidden sm:flex items-center -space-x-1.5 overflow-hidden py-1 px-1">
            {activeUserList.slice(0, 3).map((u) => {
              const userMuted = u.isMuted;
              return (
                <div
                  key={u.id}
                  title={`${u.name}${u.isHost ? ' (Host)' : ''}${userMuted ? ' (Muted)' : ''}`}
                  style={{ backgroundColor: u.color || '#3b82f6' }}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-white text-[10px] font-bold shadow-2xs relative transition-transform hover:scale-110"
                >
                  {u.name.slice(0, 2).toUpperCase()}
                  {u.isHost && (
                    <Crown className="w-2.5 h-2.5 text-amber-300 absolute -top-1 -right-1 fill-amber-300 drop-shadow" />
                  )}
                  {userMuted && (
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white dark:border-slate-800 flex items-center justify-center absolute -bottom-0.5 -right-0.5 z-20">
                      <MicOff className="w-1.5 h-1.5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
            {activeUserList.length > 3 && (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-2xs">
                +{activeUserList.length - 3}
              </div>
            )}
          </div>
        )}

        {/* User Identity & Profile Button */}
        <button
          id="user-profile-btn"
          onClick={() => {
            setTempName(currentUser.name);
            setShowProfileModal(true);
          }}
          title="Account profile & identity"
          className="flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
        >
          <div
            className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shadow-xs shrink-0"
            style={{ backgroundColor: currentUser.color || '#3b82f6' }}
          >
            {(authUser?.name || currentUser.name || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="hidden md:inline truncate max-w-[85px]">
            {authUser?.name || currentUser.name}
          </span>
        </button>

        {/* If guest or not signed in, show Sign In button */}
        {(!authUser || authUser.isGuest) && (
          <button
            id="sign-in-prompt-btn"
            onClick={onOpenAuthModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="Sign in or register to save your rooms"
          >
            <LogIn className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}

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
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer active:scale-95 bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700"
            title="Share room code or invite link"
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}
      </div>

      {/* User Profile & Account Settings Dialog mounted through React Portal (Centered, No viewport shift) */}
      {showProfileModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowProfileModal(false);
            }}
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                    W
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Profile & Identity
                  </h3>
                </div>
                {theme === 'dark' ? (
                  <button
                    onClick={onToggleTheme}
                    className="p-1.5 rounded-lg text-amber-400 hover:bg-slate-800 transition-colors"
                    title="Switch to Light mode"
                  >
                    <Sun className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={onToggleTheme}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                    title="Switch to Dark mode"
                  >
                    <Moon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Account Status Card */}
              {authUser && !authUser.isGuest ? (
                <div className="mb-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
                      style={{ backgroundColor: authUser.color || '#3b82f6' }}
                    >
                      {authUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {authUser.name}
                        </span>
                        <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full">
                          Signed In
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">@{authUser.username}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{authUser.email}</p>
                    </div>
                  </div>
                  <button
                    id="modal-signout-btn"
                    onClick={() => {
                      onLogout();
                      setShowProfileModal(false);
                    }}
                    className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-between">
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-semibold">Guest Session</p>
                    <p className="text-[11px] text-blue-600/80 dark:text-blue-400">Save rooms by signing in</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileModal(false);
                      onOpenAuthModal();
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                </div>
              )}

              {/* Display Name Input */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  maxLength={20}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="e.g. Alex Doe"
                />
              </div>

              {/* Cursor / Avatar Color */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                          ? 'ring-2 ring-offset-2 ring-slate-800 dark:ring-white scale-110'
                          : 'hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                {authUser && !authUser.isGuest ? (
                  <button
                    onClick={() => {
                      onLogout();
                      setShowProfileModal(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProfileModal(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (tempName.trim()) {
                        onUpdateUserName(tempName.trim());
                      }
                      setShowProfileModal(false);
                    }}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm cursor-pointer transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
