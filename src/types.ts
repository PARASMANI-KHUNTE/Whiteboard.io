export type ToolType = 'pen' | 'highlighter' | 'eraser' | 'sticky' | 'text';

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

export type CanvasElement = DrawingStroke | StickyNote | TextElement;

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; tool?: ToolType; isDrawing?: boolean };
  isSpeaking?: boolean;
  audioLevel?: number; // 0 to 1
  isHost?: boolean;
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
  elements: Record<string, CanvasElement>;
  users: Record<string, RemoteUser>;
  voteToClear: VoteToClearState | null;
}
