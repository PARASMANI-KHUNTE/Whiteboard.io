export const WELCOME_HINT_DURATION_MS = 8000;

export interface PausableTimerState {
  remainingMs: number;
  startedAt: number | null;
  paused: boolean;
}

export function createPausableTimer(durationMs: number = WELCOME_HINT_DURATION_MS): PausableTimerState {
  return {
    remainingMs: Math.max(0, Math.round(durationMs)),
    startedAt: null,
    paused: false,
  };
}

export function startPausableTimer(
  state: PausableTimerState,
  now: number = Date.now()
): PausableTimerState {
  if (state.paused || state.remainingMs <= 0 || state.startedAt !== null) {
    return state;
  }
  return { ...state, startedAt: now };
}

export function pausePausableTimer(
  state: PausableTimerState,
  now: number = Date.now()
): PausableTimerState {
  if (state.paused) return state;
  const elapsed = state.startedAt !== null ? Math.max(0, now - state.startedAt) : 0;
  return {
    remainingMs: Math.max(0, state.remainingMs - elapsed),
    startedAt: null,
    paused: true,
  };
}

export function resumePausableTimer(
  state: PausableTimerState,
  now: number = Date.now()
): PausableTimerState {
  if (!state.paused || state.remainingMs <= 0) return state;
  return {
    remainingMs: state.remainingMs,
    startedAt: now,
    paused: false,
  };
}
