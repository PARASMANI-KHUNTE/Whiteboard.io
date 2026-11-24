import React, { useState, useRef, useCallback } from 'react';
import { RemoteUser } from '../types';
import { AuthUser } from '../hooks/useAuth';
import { usePopoverDismiss } from '../hooks/usePopoverDismiss';
import { AudioVisualizerBar } from './AudioVisualizerBar';
import { AboutModal } from './AboutModal';
import { ModalShell } from './ui/ModalShell';
import { USER_PROFILE_PALETTE } from '../constants/palettes';
import { ColorSwatches } from './ui/ColorSwatches';
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
  Sparkles,
  Info,
  MessageSquare,
  MoreHorizontal,
  UserRound,
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
  onOpenAiModal?: () => void;
  /** Toggle the docked AI chat for the current session. */
  onToggleAiChat?: () => void;
  isAiChatOpen?: boolean;
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
  onClearError: () => void;
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
  onOpenAiModal,
  onToggleAiChat,
  isAiChatOpen = false,
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
  onClearError,
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
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [tempName, setTempName] = useState(currentUser.name);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const closeMobileMenu = useCallback(() => setShowMobileMenu(false), []);
  usePopoverDismiss(mobileMenuRef, showMobileMenu, closeMobileMenu);

  const runMobileAction = (action: () => void) => {
    setShowMobileMenu(false);
    action();
  };

  const activeUserList = Object.values(users) as RemoteUser[];

  return (
    <header
      id="whiteboard-header"
      className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs px-2 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none transition-colors"
    >
      {/* Brand & Room Info */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md ring-1 ring-white/20 tracking-tighter">
            W
          </div>
          <div className="hidden lg:flex items-center gap-1.5">
            <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
              Whiteboard
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-md border border-blue-200/60 dark:border-blue-900/40">
              v1.0
            </span>
          </div>
        </div>

        {/* Room / Session Selector Button */}
        <div className="flex items-center gap-1.5">
          <button
            id="room-selector-btn"
            onClick={onOpenCreateRoomModal}
            aria-label="Choose or create a room"
            className="text-xs font-semibold px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 rounded-xl text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70 dark:border-slate-700 min-h-[44px] max-w-[110px] sm:max-w-[190px] btn-press shadow-2xs"
            title={isSoloMode ? "Personal Canvas (Private). Click to browse sessions or create a room" : "Click to view sessions or create a new room"}
          >
            <span className="truncate">{isSoloMode ? 'Solo Canvas' : (roomName ? roomName : `room/${roomId}`)}</span>
            <Plus className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Connection status indicator */}
          <div
            title={isSoloMode ? 'Personal canvas (Private)' : (isConnected ? 'Connected to real-time sync' : 'Reconnecting...')}
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800"
          >
            <span className="relative flex h-2 w-2">
              {isConnected && !isSoloMode && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isSoloMode
                    ? 'bg-blue-400'
                    : isConnected
                    ? 'bg-emerald-500'
                    : 'bg-amber-500 animate-pulse'
                }`}
              />
            </span>
            <span className="hidden xl:inline font-mono text-[11px]">
              {isSoloMode ? 'Private' : isConnected ? 'Live' : 'Syncing'}
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
          onClearError={onClearError}
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
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Host Admin Panel Button */}
        {isHost && (
          <button
            id="admin-panel-toggle-btn"
            type="button"
            aria-label="Open room host admin settings"
            onClick={onOpenAdminModal}
            className="hidden sm:inline-flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[44px] rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-semibold transition-colors cursor-pointer btn-press"
            title="Room Host Admin Settings"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {/* About Whiteboard.io & Alternatives Comparison */}
        <button
          id="about-app-btn"
          type="button"
          aria-label="About Whiteboard.io"
          onClick={() => setShowAboutModal(true)}
          title="About Whiteboard.io & Why It's Different"
          className="hidden sm:inline-flex items-center justify-center p-2 min-w-[44px] min-h-[44px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer btn-press"
        >
          <Info className="w-4 h-4" />
        </button>

        {/* Dark / Light Theme Toggle */}
        <button
          id="theme-toggle-btn"
          type="button"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="hidden sm:inline-flex items-center justify-center p-2 min-w-[44px] min-h-[44px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer btn-press"
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
          type="button"
          aria-label="Open account profile"
          onClick={() => {
            setTempName(currentUser.name);
            setShowProfileModal(true);
          }}
          title="Account profile & identity"
          className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 sm:py-1.5 min-h-[44px] rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer btn-press shadow-2xs"
        >
          <div
            className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shadow-xs shrink-0 ring-1 ring-white/30"
            style={{ backgroundColor: currentUser.color || '#3b82f6' }}
          >
            {(currentUser.name || authUser?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="hidden md:inline truncate max-w-[85px]">
            {currentUser.name || authUser?.name}
          </span>
        </button>

        {/* If guest or not signed in, show Sign In button */}
        {(!authUser || authUser.isGuest) && (
          <button
            id="sign-in-prompt-btn"
            type="button"
            aria-label="Sign in or register"
            onClick={onOpenAuthModal}
            className="hidden sm:inline-flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[44px] rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer btn-press"
            title="Sign in or register to save your rooms"
          >
            <LogIn className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}

        {/* AI Chat Sidepanel Toggle (current session) */}
        {onToggleAiChat && (
          <button
            id="ai-chat-header-btn"
            type="button"
            aria-label={isAiChatOpen ? 'Minimize AI chat' : 'Open AI chat'}
            onClick={onToggleAiChat}
            aria-pressed={isAiChatOpen}
            title={
              isAiChatOpen
                ? 'Minimize the AI chat for this session'
                : 'Open the AI chat for this session'
            }
            className={`relative hidden sm:inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-2 min-h-[44px] rounded-xl border text-xs font-semibold transition-colors cursor-pointer btn-press ${
              isAiChatOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">AI Chat</span>
            {isAiChatOpen && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>
        )}

        {/* AI Diagram Button */}
        {onOpenAiModal && (
          <button
            id="ai-diagram-header-btn"
            type="button"
            aria-label="Generate AI diagram"
            onClick={onOpenAiModal}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 min-w-[44px] min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md cursor-pointer active:scale-95 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-500/20 btn-press"
            title="Generate Mindmaps, Flowcharts & Sticky Boards with Gemini AI"
          >
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 animate-pulse shrink-0" />
            <span className="hidden md:inline">AI Diagram</span>
            <span className="md:hidden">AI</span>
          </button>
        )}

        {/* Share Button / Share & Go Live */}
        {isSoloMode ? (
          <button
            id="share-go-live-btn"
            type="button"
            aria-label="Share and go live"
            onClick={onShareAndGoLive}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 min-w-[44px] min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md cursor-pointer active:scale-95 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-blue-500/20 btn-press"
            title="Convert this solo canvas to a collaborative room and invite friends"
          >
            <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300 animate-pulse shrink-0" />
            <span className="hidden sm:inline font-bold">Share & Go Live</span>
          </button>
        ) : (
          <button
            id="share-room-modal-btn"
            type="button"
            aria-label="Share room code or invite link"
            onClick={onOpenShareModal}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 min-w-[44px] min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer active:scale-95 bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 btn-press"
            title="Share room code or invite link"
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}

        {/* Overflow menu for narrow screens */}
        <div ref={mobileMenuRef} className="relative sm:hidden">
          <button
            id="mobile-header-menu-btn"
            type="button"
            data-popover-trigger
            aria-label="More header actions"
            aria-expanded={showMobileMenu}
            aria-controls="mobile-header-menu"
            onClick={() => setShowMobileMenu((open) => !open)}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {showMobileMenu && (
            <div
              id="mobile-header-menu"
              role="menu"
              aria-label="More header actions"
              className="absolute right-0 top-full mt-2 w-56 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl text-slate-700 dark:text-slate-200 animate-in zoom-in-95 duration-150 z-50"
            >
              {isHost && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMobileAction(onOpenAdminModal)}
                  className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-amber-500" />
                  Admin settings
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => runMobileAction(() => setShowAboutModal(true))}
                className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Info className="w-4 h-4 text-slate-400" />
                About Whiteboard.io
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMobileAction(onToggleTheme)}
                className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-500" />
                )}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runMobileAction(() => {
                    setTempName(currentUser.name);
                    setShowProfileModal(true);
                  })
                }
                className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <UserRound className="w-4 h-4 text-slate-400" />
                Account profile
              </button>
              {(!authUser || authUser.isGuest) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMobileAction(onOpenAuthModal)}
                  className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-slate-400" />
                  Sign in or register
                </button>
              )}
              {onToggleAiChat && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMobileAction(onToggleAiChat)}
                  className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                  {isAiChatOpen ? 'Minimize AI chat' : 'Open AI chat'}
                </button>
              )}
              {onOpenAiModal && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMobileAction(onOpenAiModal)}
                  className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  Generate AI diagram
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Profile & Account Settings Dialog mounted through React Portal (Centered, No viewport shift) */}
      <ModalShell
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        titleId="profile-modal-title"
        overlayClassName="z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        panelClassName="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100"
      >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                    W
                  </div>
                  <h3 id="profile-modal-title" className="font-bold text-slate-900 dark:text-white text-base">
                    Profile & Identity
                  </h3>
                </div>
                {theme === 'dark' ? (
                  <button
                    type="button"
                    aria-label="Switch to light theme"
                    onClick={onToggleTheme}
                    className="p-1.5 rounded-lg text-amber-400 hover:bg-slate-800 transition-colors"
                    title="Switch to Light mode"
                  >
                    <Sun className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Switch to dark theme"
                    onClick={onToggleTheme}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">@{authUser.username}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{authUser.email}</p>
                    </div>
                  </div>
                  <button
                    id="modal-signout-btn"
                    type="button"
                    aria-label="Sign out"
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
                    type="button"
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
                <label htmlFor="profile-display-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  id="profile-display-name"
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
                <div id="profile-color-label" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cursor & Avatar Color
                </div>
                <ColorSwatches
                  colors={USER_PROFILE_PALETTE}
                  selectedColor={currentUser.color}
                  onSelect={onUpdateUserColor}
                  size="md"
                  ringTone="slate"
                  ariaLabelledBy="profile-color-label"
                  ariaLabelPrefix="Use "
                  ariaLabelSuffix=" cursor and avatar color"
                  className="gap-2"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                {authUser && !authUser.isGuest ? (
                  <button
                    type="button"
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
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
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
      </ModalShell>

      {/* About & Alternatives Comparison Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        onOpenAiModal={onOpenAiModal}
      />
    </header>
  );
};
