import React, { useState } from 'react';
import { RemoteUser } from '../types';
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
  ExternalLink,
  Crown,
} from 'lucide-react';

interface HeaderProps {
  roomId: string;
  currentUser: { id: string; name: string; color: string };
  users: Record<string, RemoteUser>;
  isConnected: boolean;
  isHost: boolean;
  onUpdateUserName: (name: string) => void;
  onUpdateUserColor: (color: string) => void;
  onSwitchRoom: (newRoomId: string) => void;
  // Audio
  isMicActive: boolean;
  audioLevel: number;
  isSpeaking: boolean;
  frequencyData: Uint8Array;
  isSimulated: boolean;
  onToggleMic: () => void;
  onToggleSimulated: () => void;
  onAudioLevelChange?: (level: number, isSpeaking: boolean) => void;
}

const PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const Header: React.FC<HeaderProps> = ({
  roomId,
  currentUser,
  users,
  isConnected,
  isHost,
  onUpdateUserName,
  onUpdateUserColor,
  onSwitchRoom,
  isMicActive,
  audioLevel,
  isSpeaking,
  frequencyData,
  isSimulated,
  onToggleMic,
  onToggleSimulated,
  onAudioLevelChange,
}) => {
  const [copied, setCopied] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [tempName, setTempName] = useState(currentUser.name);
  const [tempRoomInput, setTempRoomInput] = useState('');

  const handleCopyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      prompt('Copy this room link to share with friends:', url.toString());
    }
  };

  const activeUserList = Object.values(users) as RemoteUser[];
  const totalUsers = Math.max(1, activeUserList.length);

  return (
    <header
      id="whiteboard-header"
      className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-200 shadow-xs px-4 sm:px-8 flex items-center justify-between gap-4 select-none"
    >
      {/* Brand & Room Info */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-xs">
            W
          </div>
          <span className="font-semibold text-base sm:text-lg tracking-tight text-slate-900 hidden sm:block">
            Whiteboard.io
          </span>
        </div>

        <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRoomModal(true)}
            className="text-xs font-medium px-3 py-1 bg-slate-100 hover:bg-slate-200/80 rounded-full text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Click to switch or create room"
          >
            <span>room/{roomId}</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </button>

          {/* Connection status */}
          <div
            title={isConnected ? 'Connected to WebSocket server' : 'Disconnected, reconnecting...'}
            className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-rose-400 ring-2 ring-rose-100'
              }`}
            />
            <span className="text-[11px] text-slate-400 hidden md:inline">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Audio Wave Visualizer Center ("The Wow Feature") */}
      <div className="flex items-center">
        <AudioVisualizerBar
          isMicActive={isMicActive}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          frequencyData={frequencyData}
          isSimulated={isSimulated}
          onToggleMic={onToggleMic}
          onToggleSimulated={onToggleSimulated}
          onAudioLevelChange={onAudioLevelChange}
        />
      </div>

      {/* Active Collaborators & Share Room Link */}
      <div className="flex items-center gap-3">
        {/* Collaborators Avatar Stack */}
        <div className="flex items-center -space-x-2">
          {activeUserList.slice(0, 4).map((u) => {
            const isMe = u.id === currentUser.id;
            const speaking = isMe ? isSpeaking : u.isSpeaking;

            return (
              <div
                key={u.id}
                title={`${u.name}${isMe ? ' (You)' : ''}${u.isHost ? ' • Host' : ''}${speaking ? ' • Speaking' : ''}`}
                style={{ backgroundColor: u.color }}
                className={`w-8 h-8 rounded-full text-white text-[11px] font-bold flex items-center justify-center border-2 border-white shadow-xs transition-all relative ${
                  speaking ? 'ring-2 ring-blue-500 scale-105 z-10' : ''
                }`}
              >
                {u.name.slice(0, 2).toUpperCase()}
                {u.isHost && (
                  <Crown className="w-2.5 h-2.5 text-amber-300 absolute -top-1 -right-1 fill-amber-300 drop-shadow" />
                )}
              </div>
            );
          })}
          {activeUserList.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
              +{activeUserList.length - 4}
            </div>
          )}
        </div>

        {/* User Identity / Edit button */}
        <button
          id="user-profile-btn"
          onClick={() => {
            setTempName(currentUser.name);
            setShowProfileModal(true);
          }}
          title="Customize your name and cursor color"
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {/* Share Room Link Button */}
        <button
          id="share-room-link-btn"
          onClick={handleCopyLink}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-xs cursor-pointer active:scale-95 ${
            copied
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          <span className="hidden sm:inline">{copied ? 'Link Copied' : 'Share Link'}</span>
        </button>
      </div>

      {/* User Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="font-bold text-slate-900 text-base mb-1">Your Identity</h3>
            <p className="text-xs text-slate-500 mb-4">
              Other collaborators see this name and cursor tag in real-time.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                maxLength={20}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Maya the Artist"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Avatar & Cursor Color
              </label>
              <div className="flex gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => onUpdateUserColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full transition-transform ${
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
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onUpdateUserName(tempName);
                  setShowProfileModal(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch / New Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="font-bold text-slate-900 text-base mb-1">Room Management</h3>
            <p className="text-xs text-slate-500 mb-4">
              Switch to an existing room or generate a new collaborative session.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Room Name / ID
              </label>
              <input
                type="text"
                value={tempRoomInput}
                onChange={(e) => setTempRoomInput(e.target.value)}
                placeholder="e.g. design-sprint-2"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  const randomCode = 'room-' + Math.random().toString(36).substring(2, 7);
                  onSwitchRoom(randomCode);
                  setShowRoomModal(false);
                }}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                + New Random Room
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowRoomModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (tempRoomInput.trim()) {
                      onSwitchRoom(tempRoomInput.trim());
                    }
                    setShowRoomModal(false);
                  }}
                  disabled={!tempRoomInput.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg shadow-sm"
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
