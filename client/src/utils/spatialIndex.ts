import { CanvasElement, Point } from '../types';
import { getElementBounds, ElementBounds } from './wireGeometry';

/**
 * A spatial entry kept by the index. `order` mirrors the element's position in
 * the elements map so callers can recover the original draw / z-order.
 */
export interface IndexedElement {
  element: CanvasElement;
  bounds: ElementBounds;
  order: number;
}

/** Above this many grid cells an element goes into the always-scanned list. */
const MAX_CELLS_PER_ELEMENT = 256;
const DEFAULT_CELL_SIZE = 256;

function cellKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

/**
 * Uniform-grid spatial index for canvas elements.
 *
 * Replaces the previous O(n) `Object.values(elements)` scans used by hit
 * testing, marquee selection, eraser collision and viewport culling with an
 * average O(1) point lookup / O(visible) rectangle lookup.
 *
 * Wires are intentionally excluded: they have no geometry of their own (they
 * are routed from their endpoints) and every hit test skips them.
 */
export class SpatialIndex {
  private readonly cellSize: number;
  private readonly cells = new Map<string, IndexedElement[]>();
  private readonly oversized: IndexedElement[] = [];
  private readonly items: IndexedElement[] = [];

  constructor(elements: Record<string, CanvasElement>, cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = Math.max(32, cellSize);

    let order = 0;
    for (const el of Object.values(elements) as CanvasElement[]) {
      const currentOrder = order++;
      if (!el || el.type === 'wire') continue;

      const bounds = getElementBounds(el);
      if (!isFinite(bounds.x) || !isFinite(bounds.y) || !isFinite(bounds.width) || !isFinite(bounds.height)) {
        continue;
      }

      const item: IndexedElement = { element: el, bounds, order: currentOrder };
      this.items.push(item);
      this.insert(item);
    }
  }

  private insert(item: IndexedElement): void {
    const { x, y, width, height } = item.bounds;
    const minX = Math.floor(x / this.cellSize);
    const minY = Math.floor(y / this.cellSize);
    const maxX = Math.floor((x + Math.max(0, width)) / this.cellSize);
    const maxY = Math.floor((y + Math.max(0, height)) / this.cellSize);
    const spanned = (maxX - minX + 1) * (maxY - minY + 1);

    // A stroke spanning the whole canvas would otherwise be inserted into
    // thousands of cells; keep it in a small always-visited bucket instead.
    if (spanned > MAX_CELLS_PER_ELEMENT) {
      this.oversized.push(item);
      return;
    }

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = cellKey(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  /** Elements whose bounds overlap the point's grid cell. May over-report. */
  queryPoint(pt: Point): IndexedElement[] {
    const cx = Math.floor(pt.x / this.cellSize);
    const cy = Math.floor(pt.y / this.cellSize);
    const bucket = this.cells.get(cellKey(cx, cy));
    if (!bucket || bucket.length === 0) return this.oversized.length ? [...this.oversized] : [];
    return this.oversized.length ? [...bucket, ...this.oversized] : bucket;
  }

  /** Elements whose bounds intersect the given rectangle. May over-report. */
  queryRect(rect: ElementBounds): IndexedElement[] {
    const minX = Math.floor(rect.x / this.cellSize);
    const minY = Math.floor(rect.y / this.cellSize);
    const maxX = Math.floor((rect.x + Math.max(0, rect.width)) / this.cellSize);
    const maxY = Math.floor((rect.y + Math.max(0, rect.height)) / this.cellSize);
    const spanned = (maxX - minX + 1) * (maxY - minY + 1);

    if (spanned > MAX_CELLS_PER_ELEMENT) {
      return this.items;
    }

    const seen = new Set<IndexedElement>();
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) seen.add(item);
      }
    }
    for (const item of this.oversized) seen.add(item);

    return seen.size ? Array.from(seen) : [];
  }

  /** All indexed (non-wire) elements. */
  all(): IndexedElement[] {
    return this.items;
  }
}
