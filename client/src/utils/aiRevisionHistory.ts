import type { CanvasElement } from '../types';
import { computeElementsBoundingBox } from './exportTypes';
import { getElementBounds } from './wireGeometry';

export interface AiRevisionMeta {
  id: string;
  roomId: string;
  sessionId: string;
  prompt: string;
  title?: string;
  author?: { id: string; name: string; color: string };
  timestamp: number;
  elementCount: number;
}

export interface AiRevisionDetail extends AiRevisionMeta {
  elements: CanvasElement[];
}

export interface AiRevisionThumbShape {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** Counts the element kinds in a revision for its textual preview. */
export function describeAiRevisionElements(elements: CanvasElement[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const element of elements) {
    if (!element) continue;
    const key =
      element.type === 'sticky'
        ? 'Sticky notes'
        : element.type === 'shape'
          ? 'Shapes'
          : element.type === 'text'
            ? 'Text boxes'
            : element.type === 'icon'
              ? 'Icons'
              : element.type === 'wire'
                ? 'Connectors'
                : element.type === 'stroke'
                  ? element.isHighlighter
                    ? 'Highlighter strokes'
                    : 'Freehand strokes'
                  : 'Elements';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} × ${count}`);
}

/**
 * Builds a tiny vector thumbnail from the revision's AI element group. It is
 * intentionally schematic: a quick spatial preview, not a canvas re-render.
 */
export function aiRevisionThumbShapes(
  elements: CanvasElement[],
  width = 80,
  height = 48
): AiRevisionThumbShape[] {
  const record: Record<string, CanvasElement> = {};
  for (const element of elements || []) {
    if (element?.id) record[element.id] = element;
  }
  const bounds = computeElementsBoundingBox(record);
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return [];

  const pad = 2;
  const worldW = Math.max(1, bounds.width);
  const worldH = Math.max(1, bounds.height);
  const scale = Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH);
  const offsetX = pad + ((width - pad * 2) - worldW * scale) / 2;
  const offsetY = pad + ((height - pad * 2) - worldH * scale) / 2;

  return elements.flatMap((element) => {
    if (!element) return [];
    const elementBounds = getElementBounds(element);
    if (element.type === 'stroke' && (!Array.isArray(element.points) || element.points.length === 0)) {
      return [];
    }
    if (!Number.isFinite(elementBounds.x) || !Number.isFinite(elementBounds.y)) return [];
    return [{
      x: offsetX + (elementBounds.x - bounds.x) * scale,
      y: offsetY + (elementBounds.y - bounds.y) * scale,
      width: Math.max(2, elementBounds.width * scale),
      height: Math.max(2, elementBounds.height * scale),
      color: 'color' in element && typeof element.color === 'string' && element.color
        ? element.color
        : '#3b82f6',
    }];
  });
}
