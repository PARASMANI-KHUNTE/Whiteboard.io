/** Canvas backing-store sizing helpers shared by the canvas component and tests. */

export interface CanvasSizeTarget {
  width: number;
  height: number;
  style: { width: string; height: string };
}

export interface CanvasSizeSource {
  getBoundingClientRect(): { width: number; height: number };
}

export function normalizedDpr(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Media query that stops matching when the browser moves to another DPR. */
export function dprMediaQuery(value: number): string {
  return `(resolution: ${normalizedDpr(value)}dppx)`;
}

/**
 * Writes canvas pixel dimensions only when they actually change. Assigning
 * width/height reallocates and clears the backing store, so doing it on every
 * pan frame causes a large frame-time and GC penalty.
 */
export function resizeCanvasBackingStore(
  canvas: CanvasSizeTarget,
  container: CanvasSizeSource,
  devicePixelRatio: number
): boolean {
  const rect = container.getBoundingClientRect();
  const dpr = normalizedDpr(devicePixelRatio);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  let changed = false;

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
    changed = true;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
    changed = true;
  }

  const cssWidth = `${rect.width}px`;
  const cssHeight = `${rect.height}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;

  return changed;
}
