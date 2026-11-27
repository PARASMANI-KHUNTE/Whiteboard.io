import { saveRoomElements, saveRoomElementsDebounced } from "../auth";
import { canDirectClearBoard } from "../boardClear";
import { getEligibleVoterIds, tallyVote } from "../voteEligibility";
import {
  canUpdateElement,
  filterDeletableIds,
  hasLockedElement,
  isElementLocked,
} from "../elementLocks";
import {
  isRecord,
  readBoolean,
  readFiniteNumber,
  readId,
  readPoint,
  readString,
  sanitizeElement,
  sanitizeElementBatch,
  sanitizeElementIds,
  MAX_STROKE_SIZE,
  MAX_POINTS_PER_STROKE,
} from "../socketPayload";
import { stampElementAttribution } from "../attribution";
import { clearStoredBoardContext } from "../ai/context";
import { rooms } from "../roomStore";
import type { CanvasElement, VoteState } from "../roomTypes";
import type { SocketHandlerParams } from "./types";

/** Live strokes expire after this long without a new point. */
export const LIVE_STROKE_TTL_MS = 30_000;
/** Maximum simultaneous unfinished strokes per socket. */
export const MAX_CONCURRENT_LIVE_STROKES = 8;
export const VOTE_CLEAR_DURATION_MS = Number(process.env.VOTE_CLEAR_DURATION_MS) || 15000;

export function registerCanvasHandlers({ io, socket, state }: SocketHandlerParams): void {
  const { safeOn, checkCanWrite, pruneLiveStrokes, clearLiveStrokes } = state;

  // Real-time live stroke streaming (Guarded)
  safeOn("stroke-live-start", (payload: { strokeId: string; point: { x: number; y: number }; color: string; size: number; isHighlighter?: boolean }) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    if (!isRecord(payload)) return;
    const strokeId = readId(payload.strokeId);
    const point = readPoint(payload.point);
    const color = readString(payload.color, 32);
    const size = readFiniteNumber(payload.size);
    // Only default when the field is omitted; reject a present non-boolean
    // so malformed input cannot silently change how the stroke is rendered.
    const rawHighlighter = payload.isHighlighter;
    const isHighlighter = rawHighlighter === undefined ? false : readBoolean(rawHighlighter);
    if (!strokeId || !point || !color || size === null || size <= 0 || size > MAX_STROKE_SIZE || isHighlighter === null) return;

    const now = Date.now();
    pruneLiveStrokes(now);
    if (state.liveStrokes.size >= MAX_CONCURRENT_LIVE_STROKES || state.liveStrokes.has(strokeId)) return;
    state.liveStrokes.set(strokeId, { count: 1, expiresAt: now + LIVE_STROKE_TTL_MS });

    socket.to(state.currentRoomId).emit("stroke-live-started", {
      userId: state.currentUser?.id,
      strokeId,
      point,
      color,
      size,
      isHighlighter,
    });
  });

  safeOn("stroke-live-point", (payload: { strokeId: string; point: { x: number; y: number } }) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    if (!isRecord(payload)) return;
    const strokeId = readId(payload.strokeId);
    const point = readPoint(payload.point);
    if (!strokeId || !point) return;

    const now = Date.now();
    pruneLiveStrokes(now);
    const strokeState = state.liveStrokes.get(strokeId);
    if (!strokeState || strokeState.count >= MAX_POINTS_PER_STROKE) return;
    strokeState.count += 1;
    strokeState.expiresAt = now + LIVE_STROKE_TTL_MS;

    socket.to(state.currentRoomId).emit("stroke-live-pointed", { strokeId, point });
  });

  // Final element creation (persisted, Guarded)
  safeOn("element-create", (element: CanvasElement) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    const clean = sanitizeElement(element);
    if (!clean) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (isElementLocked(room.elements[clean.id])) {
      socket.emit("permission-denied", {
        message: "Locked elements cannot be replaced.",
      });
      return;
    }
    const actor = {
      id: state.currentUser?.id ?? (clean.userId as string),
      name: state.currentUser?.name ?? (clean.userName as string | undefined) ?? "Unknown",
      color: state.currentUser?.color ?? "#6b7280",
    };
    const attributed = stampElementAttribution(clean, room.elements[clean.id], actor);
    room.elements[clean.id] = attributed as CanvasElement;
    state.liveStrokes.delete(clean.id);
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 400);
    socket.to(state.currentRoomId).emit("element-created", attributed);
  });

  // Batch element creation (e.g. converting solo canvas to multiplayer room, Guarded)
  safeOn("elements-batch-create", (elementsList: CanvasElement[]) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    const clean = sanitizeElementBatch(elementsList);
    if (clean.length === 0) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (hasLockedElement(room.elements, clean.map((el) => el.id))) {
      socket.emit("permission-denied", {
        message: "Locked elements cannot be replaced.",
      });
      return;
    }
    const now = Date.now();
    const actor = {
      id: state.currentUser?.id ?? "unknown",
      name: state.currentUser?.name ?? "Unknown",
      color: state.currentUser?.color ?? "#6b7280",
    };
    const attributedBatch = clean.map((el) => {
      const stamped = stampElementAttribution(el, room.elements[el.id], actor, now);
      room.elements[el.id] = stamped as CanvasElement;
      return stamped;
    });
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 400);
    socket.to(state.currentRoomId).emit("elements-batch-created", attributedBatch);
  });

  // Element update (e.g. moving sticky note or updating text, Guarded)
  safeOn("element-update", (element: CanvasElement) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    const clean = sanitizeElement(element);
    if (!clean) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (!canUpdateElement(room.elements[clean.id], clean as CanvasElement)) {
      socket.emit("permission-denied", {
        message: "Locked elements cannot be modified. Unlock them first.",
      });
      return;
    }
    const actor = {
      id: state.currentUser?.id ?? (clean.userId as string),
      name: state.currentUser?.name ?? (clean.userName as string | undefined) ?? "Unknown",
      color: state.currentUser?.color ?? "#6b7280",
    };
    const attributed = stampElementAttribution(clean, room.elements[clean.id], actor);
    if (room.elements[clean.id]) {
      room.elements[clean.id] = { ...room.elements[clean.id], ...attributed } as CanvasElement;
    } else {
      room.elements[clean.id] = attributed as CanvasElement;
    }
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 800);
    socket.to(state.currentRoomId).emit("element-updated", attributed);
  });

  // Element delete (Guarded)
  safeOn("element-delete", (payload: { elementId: string }) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    if (!isRecord(payload)) return;
    const elementId = readId(payload.elementId);
    if (!elementId) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    if (isElementLocked(room.elements[elementId])) {
      socket.emit("permission-denied", {
        message: "Locked elements cannot be deleted. Unlock them first.",
      });
      return;
    }
    delete room.elements[elementId];
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 400);
    socket.to(state.currentRoomId).emit("element-deleted", { elementId });
  });

  // Batch elements delete (e.g. eraser dragged across multiple strokes, Guarded)
  safeOn("elements-batch-delete", (payload: { elementIds: string[] }) => {
    if (!state.currentRoomId || !checkCanWrite()) return;
    let elementIds = sanitizeElementIds(isRecord(payload) ? payload.elementIds : undefined);
    if (elementIds.length === 0) return;
    const room = rooms.get(state.currentRoomId);
    if (!room) return;
    const deletableIds = filterDeletableIds(room.elements, elementIds);
    if (deletableIds.length !== elementIds.length) {
      socket.emit("permission-denied", {
        message: "Locked elements cannot be deleted. Unlock them first.",
      });
    }
    if (deletableIds.length === 0) return;
    elementIds = deletableIds;
    elementIds.forEach((id) => {
      delete room.elements[id];
    });
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 400);
    socket.to(state.currentRoomId).emit("elements-batch-deleted", { elementIds });
  });

  // Multiplayer cursor movement
  safeOn("cursor-move", (cursor: { x: number; y: number; tool?: string; isDrawing?: boolean }) => {
    if (!state.currentRoomId || !state.currentUser) return;
    if (!isRecord(cursor)) return;
    const point = readPoint(cursor);
    if (!point) return;
    const cleanCursor = {
      ...point,
      tool: readString(cursor.tool, 32) || undefined,
      isDrawing: readBoolean(cursor.isDrawing) === true,
    };
    state.currentUser.cursor = cleanCursor;
    socket.to(state.currentRoomId).emit("cursor-moved", {
      userId: state.currentUser.id,
      cursor: cleanCursor,
    });
  });

  // Vote to Clear Feature
  safeOn("vote-clear-start", () => {
    if (!state.currentRoomId || !state.currentUser || !checkCanWrite()) return;
    const targetRoomId = state.currentRoomId;
    const room = rooms.get(targetRoomId);
    if (!room) return;
    // Viewers cannot vote, so they are not part of the quorum (#69).
    const userIds = getEligibleVoterIds(room);

    // If only 1 eligible user, clear immediately
    if (userIds.length <= 1) {
      room.elements = {};
      clearLiveStrokes();
      clearStoredBoardContext(targetRoomId);
      void saveRoomElements(targetRoomId, {});
      io.to(targetRoomId).emit("board-cleared", {
        initiatorName: state.currentUser.name,
        clearedBy: { userId: state.currentUser.id, name: state.currentUser.name },
        wasVoted: false,
      });
      return;
    }

    // If a vote is already active, ignore
    if (room.voteToClear && room.voteToClear.active) return;

    const durationMs = VOTE_CLEAR_DURATION_MS;
    const newVote: VoteState = {
      active: true,
      initiatorId: state.currentUser.id,
      initiatorName: state.currentUser.name,
      votes: {
        [state.currentUser.id]: true, // Initiator votes yes by default
      },
      totalEligible: userIds.length,
      startedAt: Date.now(),
      durationMs,
    };

    room.voteToClear = newVote;

    io.to(targetRoomId).emit("vote-clear-started", newVote);

    // Clear any previous timer
    if (room.voteTimer) clearTimeout(room.voteTimer);

    room.voteTimer = setTimeout(() => {
      const currentRoom = rooms.get(targetRoomId);
      if (!currentRoom || !currentRoom.voteToClear) return;

      // Check votes at expiration against the current eligible voter set.
      const { yesCount, totalEligible, passed } = tallyVote(
        currentRoom,
        currentRoom.voteToClear
      );

      if (passed) {
        currentRoom.elements = {};
        clearLiveStrokes();
        clearStoredBoardContext(targetRoomId);
        void saveRoomElements(targetRoomId, {});
        io.to(targetRoomId).emit("board-cleared", {
          initiatorName: currentRoom.voteToClear.initiatorName,
          clearedBy: {
            userId: currentRoom.voteToClear.initiatorId,
            name: currentRoom.voteToClear.initiatorName,
          },
          wasVoted: true,
        });
      }

      io.to(targetRoomId).emit("vote-clear-ended", {
        passed,
        yesCount,
        totalEligible,
        reason: "timed_out",
      });

      currentRoom.voteToClear = null;
      currentRoom.voteTimer = null;
    }, durationMs);
  });

  safeOn("vote-clear-cast", (data: { vote: boolean }) => {
    if (!state.currentRoomId || !state.currentUser || !checkCanWrite()) return;
    if (!isRecord(data)) return;
    const vote = readBoolean(data.vote);
    if (vote === null) return;
    const room = rooms.get(state.currentRoomId);
    if (!room || !room.voteToClear || !room.voteToClear.active) return;

    room.voteToClear.votes[state.currentUser.id] = vote;

    const { yesCount, totalEligible, passed } = tallyVote(room, room.voteToClear);
    room.voteToClear.totalEligible = totalEligible;

    // Broadcast updated votes
    io.to(state.currentRoomId).emit("vote-clear-updated", room.voteToClear);

    // If majority yes reached early
    if (passed) {
      if (room.voteTimer) clearTimeout(room.voteTimer);
      room.elements = {};
      clearLiveStrokes();
      clearStoredBoardContext(state.currentRoomId);
      void saveRoomElements(state.currentRoomId, {});
      io.to(state.currentRoomId).emit("board-cleared", {
        initiatorName: room.voteToClear.initiatorName,
        clearedBy: {
          userId: room.voteToClear.initiatorId,
          name: room.voteToClear.initiatorName,
        },
        wasVoted: true,
      });
      io.to(state.currentRoomId).emit("vote-clear-ended", {
        passed: true,
        yesCount,
        totalEligible,
        reason: "majority_reached",
      });
      room.voteToClear = null;
      room.voteTimer = null;
      return;
    }
  });

  safeOn("vote-clear-cancel", () => {
    if (!state.currentRoomId || !state.currentUser) return;
    const room = rooms.get(state.currentRoomId);
    if (!room || !room.voteToClear || !room.voteToClear.active) return;
    if (room.voteToClear.initiatorId !== state.currentUser.id) return;

    if (room.voteTimer) clearTimeout(room.voteTimer);
    room.voteToClear = null;
    room.voteTimer = null;

    io.to(state.currentRoomId).emit("vote-clear-ended", {
      passed: false,
      yesCount: 0,
      totalEligible: getEligibleVoterIds(room).length,
      reason: "cancelled_by_initiator",
    });
  });

  // Direct clear: only the host, or the sole participant of a room, may
  // bypass the vote-to-clear flow. Editors must use the vote instead.
  safeOn("clear-board-direct", (ack?: (result: { ok: boolean }) => void) => {
    const respond = (ok: boolean) => {
      try {
        ack?.({ ok });
      } catch (_) {
        // Client disconnected before the acknowledgment arrived.
      }
    };

    if (!state.currentRoomId || !state.currentUser) {
      respond(false);
      return;
    }
    const room = rooms.get(state.currentRoomId);
    if (!room) {
      respond(false);
      return;
    }

    if (!canDirectClearBoard(Object.keys(room.users).length, state.currentUser.isHost === true)) {
      socket.emit("permission-denied", {
        message: "Only the room host can clear the board directly. Start a vote to clear instead.",
      });
      respond(false);
      return;
    }
    if (!checkCanWrite()) {
      respond(false);
      return;
    }

    // A direct clear supersedes any pending vote: cancel it and its timer
    // so participants do not keep a stale vote that fires a second clear.
    if (room.voteToClear?.active) {
      if (room.voteTimer) clearTimeout(room.voteTimer);
      room.voteToClear = null;
      room.voteTimer = null;
      io.to(state.currentRoomId).emit("vote-clear-ended", {
        passed: false,
        yesCount: 0,
        totalEligible: getEligibleVoterIds(room).length,
        reason: "cancelled_by_direct_clear",
      });
    }

    room.elements = {};
    clearLiveStrokes();
    clearStoredBoardContext(state.currentRoomId);
    void saveRoomElements(state.currentRoomId, {});
    io.to(state.currentRoomId).emit("board-cleared", {
      initiatorName: state.currentUser.name,
      clearedBy: { userId: state.currentUser.id, name: state.currentUser.name },
      wasVoted: false,
    });
    respond(true);
  });
}
