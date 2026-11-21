export const MAX_ID_LENGTH = 128;
export const MAX_NAME_LENGTH = 48;
export const MAX_REASON_LENGTH = 200;
export const MAX_BATCH_ELEMENTS = 2000;

export interface SanitizedElement {
  id: string;
  type?: string;
  [key: string]: unknown;
}

export interface Point {
  x: number;
  y: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readString(value: unknown, maxLength: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

export function readFiniteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Strict boolean parsing: truthy strings/objects must not count as a vote. */
export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function readPoint(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  return x === null || y === null ? null : { x, y };
}

export function sanitizeElement(value: unknown): SanitizedElement | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id, MAX_ID_LENGTH);
  if (!id) return null;
  const type = readString(value.type, 32);
  return { ...value, id, ...(type ? { type } : {}) } as SanitizedElement;
}

export function sanitizeElementBatch(value: unknown): SanitizedElement[] {
  if (!Array.isArray(value)) return [];
  const sanitized: SanitizedElement[] = [];
  for (const item of value.slice(0, MAX_BATCH_ELEMENTS)) {
    const element = sanitizeElement(item);
    if (element) sanitized.push(element);
  }
  return sanitized;
}

export function sanitizeElementIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value.slice(0, MAX_BATCH_ELEMENTS)) {
    const id = readString(item, MAX_ID_LENGTH);
    if (id) ids.push(id);
  }
  return ids;
}
