export type ToolType = 'pen' | 'highlighter' | 'eraser' | 'sticky' | 'text' | 'shape' | 'icon' | 'hand';

export type ShapeType = 'rectangle' | 'circle' | 'diamond' | 'triangle' | 'star' | 'arrow';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  type: 'stroke';
  points: Point[];
  color: string;
  size: number;
  isHighlighter?: boolean;
  userId: string;
  createdAt: number;
}

export interface StickyNote {
  id: string;
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  userId: string;
  userName: string;
  updatedAt: number;
}

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  userId: string;
  userName: string;
  updatedAt: number;
}

export interface ShapeElement {
  id: string;
  type: 'shape';
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  userId: string;
  userName?: string;
  updatedAt: number;
}

export interface IconElement {
  id: string;
  type: 'icon';
  iconName: string;
  x: number;
  y: number;
  size: number;
  color: string;
  userId: string;
  userName?: string;
  updatedAt: number;
}

export type CanvasElement = DrawingStroke | StickyNote | TextElement | ShapeElement | IconElement;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  color: string;
  isGuest?: boolean;
  token?: string;
  createdRooms?: string[];
}

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; tool?: ToolType; isDrawing?: boolean };
  isSpeaking?: boolean;
  audioLevel?: number; // 0 to 1
  isHost?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  voiceConnected?: boolean;
  canWrite?: boolean;
  role?: 'admin' | 'editor' | 'viewer';
  isGuest?: boolean;
  username?: string;
}

export interface SessionRoom {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
  userCount?: number;
}

export interface VoiceOfferPayload {
  fromUserId: string;
  toUserId: string;
  offer: any;
}

export interface VoiceAnswerPayload {
  fromUserId: string;
  toUserId: string;
  answer: any;
}

export interface VoiceIceCandidatePayload {
  fromUserId: string;
  toUserId: string;
  candidate: any;
}

export interface VoiceChunkPayload {
  userId: string;
  chunk: string;
  mimeType: string;
  timestamp: number;
}

export interface VoteToClearState {
  active: boolean;
  initiatorId: string;
  initiatorName: string;
  votes: Record<string, boolean>; // userId -> true (yes) / false (no)
  totalEligible: number;
  startedAt: number;
  durationMs: number;
}

export interface RoomState {
  roomId: string;
  roomName?: string;
  creatorId?: string;
  isLocked?: boolean;
  canWrite?: boolean;
  isAdmin?: boolean;
  elements: Record<string, CanvasElement>;
  users: Record<string, RemoteUser>;
  voteToClear: VoteToClearState | null;
}
