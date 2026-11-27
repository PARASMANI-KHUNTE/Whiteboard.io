import type { Socket, Server as SocketIOServer } from "socket.io";
import type { UserSession } from "../roomTypes";

export interface SocketState {
  currentRoomId: string | null;
  currentUser: UserSession | null;
  liveStrokes: Map<string, { count: number; expiresAt: number }>;
  clearLiveStrokes: () => void;
  pruneLiveStrokes: (now: number) => void;
  checkCanWrite: () => boolean;
  safeOn: <T extends (...args: any[]) => void | Promise<void>>(event: string, handler: T) => void;
}

export interface SocketHandlerParams {
  io: SocketIOServer;
  socket: Socket;
  state: SocketState;
}
