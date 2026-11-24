/**
 * Utility helpers for canvas panning, spacebar drag, and middle-click pan detection.
 */

export interface PanInteractionOptions {
  button?: number;
  tool?: string;
  isSpacePressed?: boolean;
}

/**
 * Checks whether an event or state initiates canvas panning
 * (Middle-click drag, Hand tool, or Spacebar held).
 */
export function isPanInteraction(options: PanInteractionOptions): boolean {
  if (options.button === 1) return true;
  if (options.tool === 'hand') return true;
  if (Boolean(options.isSpacePressed)) return true;
  return false;
}

/**
 * Checks whether mouse interaction on a canvas item (shape, sticky, text, icon, wire)
 * should bail out without stopping event propagation, allowing the event to bubble
 * to the canvas container for panning or context menus.
 */
export function shouldBailOutItemMouseDown(
  e: { button?: number },
  isPanMode = false
): boolean {
  if (isPanMode) return true;
  if (typeof e.button === 'number' && e.button !== 0) return true;
  return false;
}

/**
 * Determines whether pointer events on interactive world elements should be disabled,
 * ensuring canvas gestures (eraser, wire drafting, hand panning, spacebar panning)
 * can initiate everywhere on the canvas even over objects.
 */
export function isWorldLayerPointerEventsDisabled(
  currentTool: string,
  isSpacePressed = false
): boolean {
  return (
    currentTool === 'eraser' ||
    currentTool === 'wire' ||
    currentTool === 'hand' ||
    Boolean(isSpacePressed)
  );
}
