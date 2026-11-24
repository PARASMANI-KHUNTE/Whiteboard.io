export interface LockableElement {
  id: string;
  isLocked?: boolean;
  [key: string]: unknown;
}

export function isElementLocked(element: LockableElement | undefined | null): boolean {
  return element?.isLocked === true;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function comparableFields(element: LockableElement): string {
  const copy = { ...element } as Record<string, unknown>;
  // An explicit unlock legitimately changes these two fields.
  delete copy.isLocked;
  delete copy.updatedAt;
  return canonicalize(copy);
}

/**
 * A locked element may only receive one specific mutation: an explicit unlock
 * that leaves every other field untouched. Any other update is rejected even if
 * the client claims `isLocked: false` (#73).
 */
export function canUpdateElement(
  current: LockableElement | undefined,
  incoming: LockableElement
): boolean {
  if (!isElementLocked(current)) return true;
  if (!current || current.id !== incoming.id || incoming.isLocked !== false) return false;
  return comparableFields(current) === comparableFields(incoming);
}

export function hasLockedElement(
  elements: Record<string, LockableElement>,
  ids: string[]
): boolean {
  return ids.some((id) => isElementLocked(elements[id]));
}

export function filterDeletableIds(
  elements: Record<string, LockableElement>,
  ids: string[]
): string[] {
  return ids.filter((id) => !isElementLocked(elements[id]));
}
