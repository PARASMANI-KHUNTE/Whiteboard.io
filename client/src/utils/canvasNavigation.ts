export interface NavigationStepInput {
  startTime: number;
  now: number;
  duration?: number;
  startPan: { x: number; y: number };
  targetPan: { x: number; y: number };
  startZoom: number;
  targetZoom: number;
}

export interface NavigationStepResult {
  progress: number;
  pan: { x: number; y: number };
  zoom: number;
  done: boolean;
}

/**
 * Calculates intermediate pan and zoom during viewport navigation using easeOutCubic.
 */
export function computeNavigationStep({
  startTime,
  now,
  duration = 520,
  startPan,
  targetPan,
  startZoom,
  targetZoom,
}: NavigationStepInput): NavigationStepResult {
  const elapsed = Math.max(0, now - startTime);
  const progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
  // easeOutCubic
  const ease = 1 - Math.pow(1 - progress, 3);

  const currentPanX = Math.round(startPan.x + (targetPan.x - startPan.x) * ease);
  const currentPanY = Math.round(startPan.y + (targetPan.y - startPan.y) * ease);
  const currentZ = Number((startZoom + (targetZoom - startZoom) * ease).toFixed(3));

  return {
    progress,
    pan: { x: currentPanX, y: currentPanY },
    zoom: currentZ,
    done: progress >= 1,
  };
}

/**
 * Cancels any active navigation animation frame and clears the stored id.
 * Returns true if an active animation was cancelled.
 */
export function cancelNavigationAnimation(
  state: { current: number | null },
  cancelFn: (id: number) => void = cancelAnimationFrame
): boolean {
  if (state.current !== null) {
    cancelFn(state.current);
    state.current = null;
    return true;
  }
  return false;
}

/**
 * Schedules the next navigation animation frame and stores its id.
 */
export function scheduleNavigationFrame(
  state: { current: number | null },
  callback: (now: number) => void,
  scheduleFn: (cb: (now: number) => void) => number = requestAnimationFrame
): void {
  state.current = scheduleFn(callback);
}
