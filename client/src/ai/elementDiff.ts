import type { CanvasElement } from '../types';

export interface AiElementDiffResult {
  created: CanvasElement[];
  deleted: CanvasElement[];
  updated: CanvasElement[];
  updatedBefore: CanvasElement[];
  /** Existing elements whose visible text, style, shape, dimensions, or wiring changed (not just layout x/y). */
  substantivelyUpdated: CanvasElement[];
  /** Highest-signal elements to highlight/frame after an AI turn finishes. */
  focusElements: CanvasElement[];
}

function normalizeElement(
  element: CanvasElement,
  ignoreLayoutPosition: boolean
): string {
  const copy: Record<string, unknown> = { ...(element as unknown as Record<string, unknown>) };
  delete copy.updatedAt;
  if (ignoreLayoutPosition) {
    delete copy.x;
    delete copy.y;
    if (element.type === 'wire') {
      delete copy.fromAnchor;
      delete copy.toAnchor;
    }
  }
  return JSON.stringify(copy);
}

/**
 * Compare two canvas elements ignoring `updatedAt`, which changes on every
 * server revision even when visible geometry and content are identical.
 */
export function sameElementContent(a: CanvasElement, b: CanvasElement): boolean {
  if (a === b) return true;
  return normalizeElement(a, false) === normalizeElement(b, false);
}

/**
 * Compare two canvas elements ignoring layout shift coordinates (`x`, `y`, wire anchors)
 * so incremental AI revisions pinpoint elements with newly created or modified content.
 */
export function sameSubstantiveContent(a: CanvasElement, b: CanvasElement): boolean {
  if (a === b) return true;
  return normalizeElement(a, true) === normalizeElement(b, true);
}

/**
 * Diff an existing AI session element group against the next AI revision payload,
 * separating new/edited items from sibling nodes that merely re-centered in layout.
 */
export function diffAiElements(
  current: CanvasElement[],
  nextElements: CanvasElement[]
): AiElementDiffResult {
  const currentById = new Map(current.map((element) => [element.id, element]));
  const nextById = new Map(nextElements.map((element) => [element.id, element]));

  const created = nextElements.filter((element) => !currentById.has(element.id));
  const deleted = current.filter((element) => !nextById.has(element.id));
  const updated = nextElements.filter((element) => {
    const before = currentById.get(element.id);
    return before ? !sameElementContent(before, element) : false;
  });
  const updatedBefore = updated
    .map((element) => currentById.get(element.id))
    .filter((element): element is CanvasElement => Boolean(element));
  const substantivelyUpdated = updated.filter((element) => {
    const before = currentById.get(element.id);
    return before ? !sameSubstantiveContent(before, element) : false;
  });

  const combinedPriority = new Map<string, CanvasElement>();
  for (const element of created) {
    combinedPriority.set(element.id, element);
  }
  for (const element of substantivelyUpdated) {
    combinedPriority.set(element.id, element);
  }

  let focusElements: CanvasElement[];
  if (combinedPriority.size > 0) {
    focusElements = Array.from(combinedPriority.values());
  } else if (updated.length > 0) {
    focusElements = updated;
  } else {
    focusElements = nextElements;
  }

  return {
    created,
    deleted,
    updated,
    updatedBefore,
    substantivelyUpdated,
    focusElements,
  };
}
