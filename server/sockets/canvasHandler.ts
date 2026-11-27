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
import { getDiagramRevision, recordDiagramRevision } from "../aiRevisionHistory";
import { recordBoardEvent, type BoardActor, type BoardEventInput } from "../boardChangeLog";
import {
  beginRestore,
  endRestore,
  getBoardSnapshot,
  isRoomRestoring,
  maybeCaptureSnapshot,
} from "../boardSnapshots";
import { rooms } from "../roomStore";
import type { CanvasElement, VoteState } from "../roomTypes";
import type { SocketHandlerParams } from "./types";

/** Live strokes expire after this long without a new point. */
export const LIVE_STROKE_TTL_MS = 30_000;
/** Maximum simultaneous unfinished strokes per socket. */
export const MAX_CONCURRENT_LIVE_STROKES = 8;
export const VOTE_CLEAR_DURATION_MS = Number(process.env.VOTE_CLEAR_DURATION_MS) || 15000;
const SAFE_SNAPSHOT_ID = /^[A-Za-z0-9_-]{2,128}$/;

export function registerCanvasHandlers({ io, socket, state }: SocketHandlerParams): void {
  const { safeOn, checkCanWrite, pruneLiveStrokes, clearLiveStrokes } = state;

  /** Record and broadcast a durable board event, then update the snapshot window. */
  const broadcastBoardEvent = (input: BoardEventInput, actor: BoardActor): void => {
    void recordBoardEvent(input).then((ev) => {
      io.to(input.roomId).emit("board-event", ev);
      // The restore handler emits its own event and must not trigger a snapshot.
      if (input.type !== "restore") {
        void maybeCaptureSnapshot(input.roomId, rooms.get(input.roomId)?.elements || {}, actor);
      }
    });
  };

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

    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "create",
      actor,
      elementId: clean.id,
      elementType: clean.type,
      details: { x: clean.x, y: clean.y },
    }, actor);
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

    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "batch-create",
      actor,
      elementIds: clean.map((el) => el.id),
      details: { count: clean.length },
    }, actor);
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

    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "update",
      actor,
      elementId: clean.id,
      elementType: clean.type,
      details: { x: clean.x, y: clean.y, text: clean.text },
    }, actor);
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
    const targetElement = room.elements[elementId];
    delete room.elements[elementId];
    saveRoomElementsDebounced(state.currentRoomId, room.elements, 400);
    socket.to(state.currentRoomId).emit("element-deleted", { elementId });

    const actor = {
      id: state.currentUser?.id ?? "unknown",
      name: state.currentUser?.name ?? "Unknown",
      color: state.currentUser?.color ?? "#6b7280",
    };
    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "delete",
      actor,
      elementId,
      elementType: targetElement?.type,
    }, actor);
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

    const actor = {
      id: state.currentUser?.id ?? "unknown",
      name: state.currentUser?.name ?? "Unknown",
      color: state.currentUser?.color ?? "#6b7280",
    };
    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "batch-delete",
      actor,
      elementIds,
      details: { count: elementIds.length },
    }, actor);
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

      const actor = {
        id: state.currentUser.id,
        name: state.currentUser.name,
        color: state.currentUser.color,
      };
      broadcastBoardEvent({
        roomId: targetRoomId,
        type: "clear",
        actor,
        details: { wasVoted: false, singleUser: true },
      }, actor);
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

        const actor = {
          id: currentRoom.voteToClear.initiatorId,
          name: currentRoom.voteToClear.initiatorName,
          color: currentRoom.users[currentRoom.voteToClear.initiatorId]?.color || "#6b7280",
        };
        broadcastBoardEvent({
          roomId: targetRoomId,
          type: "clear",
          actor,
          details: { wasVoted: true, reason: "timed_out" },
        }, actor);
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

      const actor = {
        id: room.voteToClear.initiatorId,
        name: room.voteToClear.initiatorName,
        color: room.users[room.voteToClear.initiatorId]?.color || "#6b7280",
      };
      broadcastBoardEvent({
        roomId: state.currentRoomId,
        type: "clear",
        actor,
        details: { wasVoted: true, reason: "majority_reached" },
      }, actor);
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

  // Restore a previous board version (#227). Host/admin only, and visible to
  // everyone as a durable board event rather than a silent rewrite.
  safeOn("restore-snapshot", async ({ snapshotId }: { snapshotId: string }) => {
    if (!state.currentRoomId || !state.currentUser) return;
    const roomId = state.currentRoomId;
    const actor = state.currentUser;
    const room = rooms.get(roomId);
    if (!room) return;

    const isHost = actor.id === room.creatorId;
    const isAdmin = room.userPermissions[actor.id]?.role === "admin";
    if (!isHost && !isAdmin) {
      socket.emit("permission-denied", {
        message: "Only the host can restore a previous version.",
      });
      return;
    }
    if (isRoomRestoring(roomId)) return;
    if (typeof snapshotId !== "string" || !SAFE_SNAPSHOT_ID.test(snapshotId)) return;

    beginRestore(roomId);
    try {
      const snapshot = await getBoardSnapshot(roomId, snapshotId);
      if (!snapshot) {
        socket.emit("snapshot-error", { message: "Version not found." });
        return;
      }

      // Deep clone so mutating the live board cannot corrupt a stored version.
      room.elements = JSON.parse(JSON.stringify(snapshot.elements)) as Record<string, CanvasElement>;
      clearLiveStrokes();
      // saveRoomElements cancels any pending debounce, so an in-flight save
      // cannot overwrite the restored board afterwards.
      await saveRoomElements(roomId, room.elements);

      io.to(roomId).emit("board-restored", {
        elements: room.elements,
        snapshot: { id: snapshot.id, timestamp: snapshot.timestamp },
        actor,
      });

      broadcastBoardEvent({
        roomId,
        type: "restore",
        actor,
        details: { snapshotId, snapshotTimestamp: snapshot.timestamp },
      }, actor);
    } finally {
      endRestore(roomId);
    }
  });

  // Every applied AI turn becomes a capped, room-scoped revision (#241). The
  // client sends the AI element group after it has been committed through the
  // normal canvas mutations, so the snapshot matches what everyone sees.
  safeOn("record-ai-revision", async (payload: {
    sessionId?: string;
    prompt?: string;
    title?: string;
    elements?: unknown;
  }) => {
    if (!state.currentRoomId || !state.currentUser || !checkCanWrite()) return;
    if (!isRecord(payload)) return;

    const sessionId = readId(payload.sessionId, 128);
    const prompt = readString(payload.prompt, 1200);
    if (!sessionId || !prompt || !Array.isArray(payload.elements)) return;

    const revision = await recordDiagramRevision(state.currentRoomId, {
      sessionId,
      prompt,
      title: readString(payload.title, 160) || undefined,
      author: {
        id: state.currentUser.id,
        name: state.currentUser.name,
        color: state.currentUser.color,
      },
      elements: payload.elements,
    });
    if (!revision) return;

    io.to(state.currentRoomId).emit("ai-revision-recorded", {
      id: revision.id,
      roomId: revision.roomId,
      sessionId: revision.sessionId,
      prompt: revision.prompt,
      timestamp: revision.timestamp,
      elementCount: revision.elements.length,
    });
  });

  // Restore only the AI-owned element group so manual work outside that group
  // is never lost. Both spellings are accepted because the feature request used
  // `restore_ai_revision` while the socket protocol is otherwise hyphenated.
  const restoreAiRevision = async (payload: { revisionId?: string }) => {
    if (!state.currentRoomId || !state.currentUser) return;
    const roomId = state.currentRoomId;
    const actor = state.currentUser;
    const room = rooms.get(roomId);
    if (!room) return;

    const isHost = actor.id === room.creatorId;
    const isAdmin = room.userPermissions[actor.id]?.role === "admin";
    if (!isHost && !isAdmin) {
      socket.emit("permission-denied", {
        message: "Only the host or an admin can restore an AI revision.",
      });
      return;
    }
    if (isRoomRestoring(roomId)) return;

    const revisionId = isRecord(payload) ? readId(payload.revisionId, 128) : null;
    if (!revisionId || !SAFE_SNAPSHOT_ID.test(revisionId)) return;

    beginRestore(roomId);
    try {
      const revision = await getDiagramRevision(roomId, revisionId);
      if (!revision) {
        socket.emit("ai-revision-error", { message: "AI revision not found." });
        return;
      }

      const prefix = `ai_${revision.sessionId}_`;
      const nextElements: Record<string, CanvasElement> = {};
      for (const [id, element] of Object.entries(room.elements)) {
        if (!id.startsWith(prefix)) nextElements[id] = element;
      }
      for (const element of sanitizeElementBatch(revision.elements)) {
        if (element.id.startsWith(prefix)) {
          nextElements[element.id] = element as CanvasElement;
        }
      }
      room.elements = nextElements;
      clearLiveStrokes();
      await saveRoomElements(roomId, room.elements);

      const restored = {
        elements: revision.elements,
        sessionId: revision.sessionId,
        revision: { id: revision.id, prompt: revision.prompt, timestamp: revision.timestamp },
        actor,
      };
      io.to(roomId).emit("ai-revision-restored", restored);
      io.to(roomId).emit("ai_revision_restored", restored);

      broadcastBoardEvent({
        roomId,
        type: "restore",
        actor,
        details: {
          revisionId,
          sessionId: revision.sessionId,
          prompt: revision.prompt,
        },
      }, actor);
    } finally {
      endRestore(roomId);
    }
  };
  safeOn("restore-ai-revision", restoreAiRevision);
  safeOn("restore_ai_revision", restoreAiRevision);

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

    const actor = {
      id: state.currentUser.id,
      name: state.currentUser.name,
      color: state.currentUser.color,
    };
    broadcastBoardEvent({
      roomId: state.currentRoomId,
      type: "clear",
      actor,
      details: { wasVoted: false, direct: true },
    }, actor);
    respond(true);
  });
}
