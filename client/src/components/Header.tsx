import React from 'react';
import { RemoteUser } from '../types';
import { AudioVisualizerBar } from './AudioVisualizerBar';
import type { WhiteboardActionRegistry } from '../hooks/useWhiteboardActions';
import { Crown, Lock, MicOff, Users } from 'lucide-react';

interface HeaderProps {
  roomId: string | null;
  isSoloMode?: boolean;
  roomName?: string;
  users: Record<string, RemoteUser>;
  isConnected: boolean;
  canWrite?: boolean;
  isLocked?: boolean;
  actions: WhiteboardActionRegistry;
  isSidebarOpen?: boolean;
  sidebarToggleRef?: React.RefObject<HTMLButtonElement | null>;
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
  onToggleDeafen: () => void;
  onToggleSimulated: () => void;
  onOpenInNewTab: () => void;
  onAudioLevelChange?: (level: number, isSpeaking: boolean) => void;
  followingUserId?: string | null;
  onToggleFollowUser?: (userId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomId,
  isSoloMode = false,
  roomName,
  users,
  isConnected,
  canWrite = true,
  isLocked = false,
  actions,
  isSidebarOpen = false,
  sidebarToggleRef,
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
  onToggleDeafen,
  onToggleSimulated,
  onOpenInNewTab,
  onAudioLevelChange,
  followingUserId = null,
  onToggleFollowUser,
}) => {
  const {
    sidebar: sidebarAction,
    share: shareAction,
    shareGoLive: shareGoLiveAction,
    admin: adminAction,
    voiceToggle: voiceToggleAction,
    voiceMute: voiceMuteAction,
  } = actions.actions;
  const SidebarIcon = sidebarAction.icon;
  const ShareGoLiveIcon = shareGoLiveAction.icon;

  const activeUserList = Object.values(users) as RemoteUser[];

  return (
    <header
      id="whiteboard-header"
      className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs px-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 select-none transition-colors"
    >
      {/* Sidebar Menu, Brand & Room Status */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          ref={sidebarToggleRef}
          id="sidebar-toggle-btn"
          type="button"
          onClick={sidebarAction.handler}
          aria-controls="whiteboard-sidebar"
          aria-expanded={isSidebarOpen}
          aria-pressed={sidebarAction.pressed}
          aria-label={sidebarAction.ariaLabel}
          title={sidebarAction.title}
          className={`inline-flex items-center justify-center p-2 min-w-[44px] min-h-[44px] rounded-xl border transition-colors cursor-pointer btn-press shrink-0 ${
            isSidebarOpen
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800 shadow-2xs'
              : 'bg-slate-50/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white shadow-2xs'
          }`}
        >
          <SidebarIcon className="w-5 h-5" aria-hidden />
        </button>

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

        {/* Active Session Status Indicators */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            id="room-status-pill"
            type="button"
            onClick={isSoloMode ? shareGoLiveAction.handler : shareAction.handler}
            aria-label={isSoloMode ? 'Solo canvas — click to share and go live' : `Room ${roomName || roomId} — click to share or manage`}
            title={isSoloMode ? 'Personal canvas — click to Share & Go Live' : `Active room: ${roomName || roomId} (click to share)`}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/80 max-w-[140px] sm:max-w-[200px] transition-colors cursor-pointer"
          >
            <span className="relative flex h-2 w-2 shrink-0">
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
            <span className="truncate">
              {isSoloMode ? 'Solo Canvas' : (roomName ? roomName : `room/${roomId}`)}
            </span>
            <span className="hidden md:inline font-mono text-[10px] text-slate-400 dark:text-slate-400">
              {isSoloMode ? '· Private' : isConnected ? '· Live' : '· Syncing'}
            </span>
          </button>

          {isLocked && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[11px] font-semibold shrink-0"
              title="Room is locked by host. Drawing is disabled for participants."
            >
              <Lock className="w-3 h-3" />
              <span className="hidden md:inline">Locked</span>
            </div>
          )}

          {!canWrite && !isLocked && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold shrink-0"
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
          onToggleVoice={voiceToggleAction.handler}
          onToggleMute={voiceMuteAction.handler}
          onToggleDeafen={onToggleDeafen}
          onToggleSimulated={onToggleSimulated}
          onOpenInNewTab={onOpenInNewTab}
          onAudioLevelChange={onAudioLevelChange}
        />
      </div>

      {/* Right Workspace Live Context: Collaborator Avatars & Solo Go Live CTA */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {!isSoloMode && activeUserList.length > 0 && (
          <button
            id="mobile-participants-btn"
            type="button"
            onClick={adminAction.handler}
            disabled={adminAction.disabled}
            aria-label={`View ${activeUserList.length} active participant${activeUserList.length === 1 ? '' : 's'}`}
            title={`${activeUserList.length} participant${activeUserList.length === 1 ? '' : 's'} — tap to view`}
            className="flex sm:hidden items-center gap-1 px-2 py-1.5 min-h-[36px] rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/80 text-xs font-semibold cursor-pointer transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
            <span className="tabular-nums">{activeUserList.length}</span>
          </button>
        )}

        {activeUserList.length > 0 && (
          <div className="hidden sm:flex items-center -space-x-1.5 overflow-hidden py-1 px-1">
            {activeUserList.slice(0, 3).map((u) => {
              const userMuted = u.isMuted;
              const isFollowing = followingUserId === u.id;
              return (
                <button
                  key={u.id}
                  id={`follow-user-btn-${u.id}`}
                  type="button"
                  onClick={() => onToggleFollowUser?.(u.id)}
                  aria-pressed={isFollowing}
                  aria-label={
                    isFollowing
                      ? `Stop following ${u.name}`
                      : `Follow ${u.name}'s cursor`
                  }
                  title={`${u.name}${u.isHost ? ' (Host)' : ''}${userMuted ? ' (Muted)' : ''} — ${
                    isFollowing ? 'Following (click to stop)' : 'Click to follow'
                  }`}
                  style={{ backgroundColor: u.color || '#3b82f6' }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-white text-[10px] font-bold shadow-2xs relative transition-transform hover:scale-110 cursor-pointer ${
                    isFollowing ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900 z-10' : ''
                  }`}
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
                </button>
              );
            })}
            {activeUserList.length > 3 && (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-2xs">
                +{activeUserList.length - 3}
              </div>
            )}
          </div>
        )}

        {isSoloMode && (
          <button
            id="share-go-live-btn"
            type="button"
            aria-label={shareGoLiveAction.ariaLabel}
            onClick={shareGoLiveAction.handler}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 min-w-[44px] min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md cursor-pointer active:scale-95 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-blue-500/20 btn-press"
            title={shareGoLiveAction.title}
          >
            <ShareGoLiveIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300 animate-pulse shrink-0" />
            <span className="hidden sm:inline font-bold">{shareGoLiveAction.shortLabel}</span>
          </button>
        )}
      </div>
    </header>
  );
};
