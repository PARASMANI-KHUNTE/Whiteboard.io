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

export interface Bounds2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeFitCamera {
  pan: { x: number; y: number };
  zoom: number;
}

/**
 * Compute unobstructed canvas insets accounting for the top header, docked
 * desktop sidebar, bottom floating toolbar, and open AI chat drawer/sheet.
 */
export function computeSafeViewportInsets(
  viewportW: number,
  viewportH: number,
  options?: { isAiChatOpen?: boolean; isSidebarOpen?: boolean }
): SafeViewportInsets {
  const isAiChatOpen = Boolean(options?.isAiChatOpen);
  const isSidebarOpen = Boolean(options?.isSidebarOpen);

  const top = 84;
  const left = isSidebarOpen && viewportW >= 1024 ? 280 : 32;
  const right = isAiChatOpen && viewportW >= 640 ? Math.min(440, Math.round(viewportW * 0.45)) : 32;
  const bottom = isAiChatOpen && viewportW < 640 ? Math.max(96, Math.round(viewportH * 0.66)) : 96;

  return { top, right, bottom, left };
}

/**
 * Fit target world bounds comfortably inside the unobstructed portion of the viewport.
 */
export function computeSafeFitCamera(
  bounds: Bounds2D,
  viewportW: number,
  viewportH: number,
  insets: SafeViewportInsets,
  options?: { minZoom?: number; maxZoom?: number; padding?: number }
): SafeFitCamera {
  const minZoom = options?.minZoom ?? 0.45;
  const maxZoom = options?.maxZoom ?? 1.15;
  const padding = options?.padding ?? 96;

  const usableW = Math.max(180, viewportW - insets.left - insets.right);
  const usableH = Math.max(160, viewportH - insets.top - insets.bottom);
  const targetW = Math.max(120, bounds.width);
  const targetH = Math.max(100, bounds.height);

  const fitZoomX = Math.max(80, usableW - padding) / targetW;
  const fitZoomY = Math.max(80, usableH - padding) / targetH;
  const zoom = Math.max(minZoom, Math.min(maxZoom, Number(Math.min(fitZoomX, fitZoomY).toFixed(2))));

  const safeCenterX = insets.left + usableW / 2;
  const safeCenterY = insets.top + usableH / 2;
  const boundsCenterX = bounds.x + targetW / 2;
  const boundsCenterY = bounds.y + targetH / 2;

  return {
    pan: {
      x: Math.round(safeCenterX - boundsCenterX * zoom),
      y: Math.round(safeCenterY - boundsCenterY * zoom),
    },
    zoom,
  };
}

/**
 * Determine whether world bounds currently sit cleanly within the unobstructed viewport area.
 */
export function areBoundsVisibleInSafeViewport(
  bounds: Bounds2D,
  pan: { x: number; y: number },
  zoom: number,
  viewportW: number,
  viewportH: number,
  insets: SafeViewportInsets,
  margin = 16
): boolean {
  const safeLeft = insets.left + margin;
  const safeRight = viewportW - insets.right - margin;
  const safeTop = insets.top + margin;
  const safeBottom = viewportH - insets.bottom - margin;

  if (safeRight <= safeLeft || safeBottom <= safeTop) return false;

  const screenLeft = bounds.x * zoom + pan.x;
  const screenRight = (bounds.x + bounds.width) * zoom + pan.x;
  const screenTop = bounds.y * zoom + pan.y;
  const screenBottom = (bounds.y + bounds.height) * zoom + pan.y;

  return (
    screenLeft >= safeLeft &&
    screenRight <= safeRight &&
    screenTop >= safeTop &&
    screenBottom <= safeBottom
  );
}
