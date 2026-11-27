import type { RoomPermission } from "./auth";

export interface CanvasElement {
  id: string;
  type: 'stroke' | 'sticky' | 'text' | string;
  [key: string]: any;
}

export interface UserSession {
  id: string;
  socketId: string;
  /** Every socket currently holding this identity (multiple tabs/windows). */
  socketIds?: string[];
  name: string;
  color: string;
  roomId: string;
  cursor?: { x: number; y: number; tool?: string; isDrawing?: boolean };
  isSpeaking?: boolean;
  audioLevel?: number;
  isHost?: boolean;
  role?: 'admin' | 'editor' | 'viewer';
  canWrite?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  voiceConnected?: boolean;
}

/** Capped AI diagram revision stored with a room and restorable for everyone. */
export interface DiagramRevision {
  id: string;
  roomId: string;
  sessionId: string;
  prompt: string;
  title?: string;
  author?: { id: string; name: string; color: string };
  /** Only the AI-owned element group for this session, not the whole board. */
  elements: CanvasElement[];
  timestamp: number;
  createdAt: number | Date | string;
}

export interface VoteState {
  active: boolean;
  initiatorId: string;
  initiatorName: string;
  votes: Record<string, boolean>;
  totalEligible: number;
  startedAt: number;
  durationMs: number;
}

export interface RoomData {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
  kickedUserIds: Set<string>;
  userPermissions: Record<string, RoomPermission>;
  elements: Record<string, CanvasElement>;
  users: Record<string, UserSession>;
  voteToClear: VoteState | null;
  voteTimer?: NodeJS.Timeout | null;
  diagramHistory?: DiagramRevision[];
}
