import { readIceCandidate, readSessionDescription } from "../voiceSignaling";
import { SlidingWindowRateLimiter } from "../joinRateLimiter";
import { isRecord, readBoolean, readFiniteNumber, readId } from "../socketPayload";
import { rooms } from "../roomStore";
import type { SocketHandlerParams } from "./types";

/** ICE trickle can be chatty, but 60 signals per 10s is ample for voice chat. */
export const signalingLimiter = new SlidingWindowRateLimiter(60, 10_000);

export function registerVoiceHandlers({ io, socket, state }: SocketHandlerParams): void {
  const { safeOn } = state;

  /** Bound WebRTC signaling frequency so one peer cannot flood another. */
  const allowVoiceSignal = (): boolean => {
    if (signalingLimiter.check(socket.id).allowed) return true;
    socket.emit("room-error", {
      message: "Too many voice signaling messages. Please slow down.",
    });
    return false;
  };

  // Audio reactivity / Speaking indicator
  safeOn("audio-level", (data: { level: number; isSpeaking: boolean }) => {
    if (!state.currentRoomId || !state.currentUser) return;
    if (!isRecord(data)) return;
    const level = readFiniteNumber(data.level);
    const isSpeaking = readBoolean(data.isSpeaking);
    if (level === null || isSpeaking === null || level < 0 || level > 1) return;
    state.currentUser.audioLevel = level;
    state.currentUser.isSpeaking = isSpeaking;
    socket.to(state.currentRoomId).emit("audio-level-updated", {
      userId: state.currentUser.id,
      level,
      isSpeaking,
    });
  });

  // Voice Chat State & Mute/Deafen update
  safeOn("voice-status-update", (data: { isMuted?: boolean; isDeafened?: boolean; voiceConnected?: boolean }) => {
    if (!state.currentRoomId || !state.currentUser) return;
    if (!isRecord(data)) return;
    const isMuted = readBoolean(data.isMuted);
    const isDeafened = readBoolean(data.isDeafened);
    const voiceConnected = readBoolean(data.voiceConnected);
    if (isMuted === null && isDeafened === null && voiceConnected === null) return;
    if (isMuted !== null) state.currentUser.isMuted = isMuted;
    if (isDeafened !== null) state.currentUser.isDeafened = isDeafened;
    if (voiceConnected !== null) state.currentUser.voiceConnected = voiceConnected;

    socket.to(state.currentRoomId).emit("voice-status-updated", {
      userId: state.currentUser.id,
      isMuted: state.currentUser.isMuted,
      isDeafened: state.currentUser.isDeafened,
      voiceConnected: state.currentUser.voiceConnected,
    });
  });

  // WebRTC Voice Signaling Mesh
  safeOn("voice-offer", (payload: { toUserId: string; offer: unknown }) => {
    if (!state.currentRoomId || !state.currentUser || !allowVoiceSignal()) return;
    if (!isRecord(payload)) return;
    const toUserId = readId(payload.toUserId);
    const offer = readSessionDescription(payload.offer, "offer");
    if (!toUserId || !offer) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    const targetUser = room.users[toUserId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit("voice-offer", {
        fromUserId: state.currentUser.id,
        offer,
      });
    }
  });

  safeOn("voice-answer", (payload: { toUserId: string; answer: unknown }) => {
    if (!state.currentRoomId || !state.currentUser || !allowVoiceSignal()) return;
    if (!isRecord(payload)) return;
    const toUserId = readId(payload.toUserId);
    const answer = readSessionDescription(payload.answer, "answer");
    if (!toUserId || !answer) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    const targetUser = room.users[toUserId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit("voice-answer", {
        fromUserId: state.currentUser.id,
        answer,
      });
    }
  });

  safeOn("voice-ice-candidate", (payload: { toUserId: string; candidate: unknown }) => {
    if (!state.currentRoomId || !state.currentUser || !allowVoiceSignal()) return;
    if (!isRecord(payload)) return;
    const toUserId = readId(payload.toUserId);
    const candidate = readIceCandidate(payload.candidate);
    if (!toUserId || !candidate) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    const targetUser = room.users[toUserId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit("voice-ice-candidate", {
        fromUserId: state.currentUser.id,
        candidate,
      });
    }
  });
}
