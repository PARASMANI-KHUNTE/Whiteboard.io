import { Mic, MicOff, PhoneOff, type LucideIcon } from 'lucide-react';

export interface VoiceActionMeta {
  id: string;
  label: string;
  shortLabel?: string;
  ariaLabel: string;
  title: string;
  Icon: LucideIcon;
  disabled: boolean;
}

/**
 * Shared display labels, icons, and accessibility metadata for joining or leaving voice chat.
 */
export function getVoiceConnectionMeta(isVoiceConnected: boolean): VoiceActionMeta {
  if (isVoiceConnected) {
    return {
      id: 'leave-voice-btn',
      label: 'Leave Voice',
      ariaLabel: 'Disconnect from voice chat',
      title: 'Disconnect from voice chat',
      Icon: PhoneOff,
      disabled: false,
    };
  }
  return {
    id: 'join-voice-btn',
    label: 'Join Voice',
    shortLabel: 'Voice',
    ariaLabel: 'Join real-time voice chat',
    title: 'Connect to Real-time Voice Chat',
    Icon: Mic,
    disabled: false,
  };
}

/**
 * Shared display labels, icons, and accessibility metadata for toggling microphone mute.
 */
export function getVoiceMuteMeta(isMuted: boolean): VoiceActionMeta {
  return {
    id: 'toggle-mic-mute-btn',
    label: isMuted ? 'Unmute' : 'Mute',
    ariaLabel: isMuted ? 'Unmute microphone' : 'Mute microphone',
    title: isMuted ? 'Unmute microphone' : 'Mute microphone',
    Icon: isMuted ? MicOff : Mic,
    disabled: false,
  };
}
