export const MAX_ID_LENGTH = 128;
export const MAX_NAME_LENGTH = 48;
export const MAX_REASON_LENGTH = 200;
export const MAX_TEXT_LENGTH = 10_000;
export const MAX_COLOR_LENGTH = 64;
export const MAX_BATCH_ELEMENTS = 2000;
export const MAX_POINTS_PER_STROKE = 5000;
export const MAX_COORD = 1_000_000;
export const MAX_DIMENSION = 100_000;
export const MAX_STROKE_SIZE = 100;

export interface SanitizedElement {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface Point {
  x: number;
  y: number;
}

/** Keys that can trigger legacy prototype setters on plain objects. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ELEMENT_TYPES = new Set(["stroke", "sticky", "text", "shape", "icon", "wire"]);
const SHAPE_TYPES = new Set(["rectangle", "circle", "diamond", "triangle", "star", "arrow"]);
const WIRE_TYPES = new Set(["line", "curve"]);
const ANCHORS = new Set(["auto", "top", "right", "bottom", "left"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const BG_SHAPES = new Set(["none", "circle", "square", "rounded"]);
const FONT_WEIGHTS = new Set(["normal", "bold"]);
const FONT_STYLES = new Set(["normal", "italic"]);
const TEXT_DECORATIONS = new Set(["none", "underline"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);

type FieldKind = "id" | "string" | "number" | "boolean" | "enum" | "points";

interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
  max?: number;
  min?: number;
  values?: Set<string>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readString(value: unknown, maxLength: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

/**
 * Accept numbers and numeric strings (cursors/legacy clients send both), but
 * reject null, booleans, arrays, objects and blank strings: `Number()` would
 * otherwise turn all of those into a valid-looking 0.
 */
export function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Strict boolean parsing: truthy strings/objects must not count as a vote. */
export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** IDs are used as plain-object keys, so reject prototype-pollution keys. */
export function readId(value: unknown, maxLength = MAX_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  // Truncating would merge two distinct IDs into one key, allowing one client
  // to overwrite another's element. Reject instead.
  if (!id || id.length > maxLength || DANGEROUS_KEYS.has(id)) return null;
  return id;
}

export function readPoint(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  if (x === null || y === null || Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return null;
  return { x, y };
}

function readPoints(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_POINTS_PER_STROKE) return null;
  const points: Point[] = [];
  for (const candidate of value) {
    const point = readPoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

/** Rebuild an element from an allowlist; unknown/proto keys are never copied. */
function applySchema(
  value: Record<string, unknown>,
  schema: Record<string, FieldSpec>
): Record<string, unknown> | null {
  const clean: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const raw = value[key];
    switch (spec.kind) {
      case "id": {
        const parsed = readId(raw, spec.max ?? MAX_ID_LENGTH);
        if (!parsed) {
          if (spec.required) return null;
          continue;
        }
        clean[key] = parsed;
        break;
      }
      case "string": {
        if (typeof raw !== "string") {
          if (spec.required) return null;
          continue;
        }
        const parsed = raw.slice(0, spec.max ?? MAX_TEXT_LENGTH);
        // An explicit empty string is how the UI clears text/label/color
        // fields. element-update merges this object, so dropping the key would
        // leave the old value in storage and never reach remote clients.
        clean[key] = parsed;
        break;
      }
      case "number": {
        const parsed = readFiniteNumber(raw);
        if (parsed === null) {
          if (spec.required) return null;
          continue;
        }
        clean[key] = Math.max(spec.min ?? -MAX_COORD, Math.min(parsed, spec.max ?? MAX_COORD));
        break;
      }
      case "boolean": {
        const parsed = readBoolean(raw);
        if (parsed === null) {
          if (spec.required) return null;
          continue;
        }
        clean[key] = parsed;
        break;
      }
      case "enum": {
        if (typeof raw !== "string" || !spec.values?.has(raw)) {
          if (spec.required) return null;
          continue;
        }
        clean[key] = raw;
        break;
      }
      case "points": {
        const parsed = readPoints(raw);
        if (!parsed) {
          if (spec.required) return null;
          continue;
        }
        clean[key] = parsed;
        break;
      }
    }
  }
  return clean;
}

const MAX_TIME = Number.MAX_SAFE_INTEGER;

const IDENTITY: Record<string, FieldSpec> = {
  userId: { kind: "id", required: true },
  userName: { kind: "string", max: MAX_NAME_LENGTH },
};

const UPDATED: Record<string, FieldSpec> = {
  ...IDENTITY,
  updatedAt: { kind: "number", required: true, min: 0, max: MAX_TIME },
  zIndex: { kind: "number", min: -MAX_TIME, max: MAX_TIME },
};

const POSITION: Record<string, FieldSpec> = {
  x: { kind: "number", required: true },
  y: { kind: "number", required: true },
};

const ELEMENT_SCHEMAS: Record<string, Record<string, FieldSpec>> = {
  stroke: {
    ...IDENTITY,
    points: { kind: "points", required: true },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
    size: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    isHighlighter: { kind: "boolean" },
    createdAt: { kind: "number", required: true, min: 0, max: MAX_TIME },
  },
  sticky: {
    ...UPDATED,
    ...POSITION,
    width: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    height: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    text: { kind: "string", max: MAX_TEXT_LENGTH, required: true },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
  },
  text: {
    ...UPDATED,
    ...POSITION,
    text: { kind: "string", max: MAX_TEXT_LENGTH, required: true },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
    fontSize: { kind: "number", required: true, min: 1, max: MAX_DIMENSION },
    fontFamily: { kind: "string", max: 128 },
    fontWeight: { kind: "enum", values: FONT_WEIGHTS },
    fontStyle: { kind: "enum", values: FONT_STYLES },
    textDecoration: { kind: "enum", values: TEXT_DECORATIONS },
    textAlign: { kind: "enum", values: TEXT_ALIGNS },
  },
  shape: {
    ...UPDATED,
    shapeType: { kind: "enum", values: SHAPE_TYPES, required: true },
    ...POSITION,
    width: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    height: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
    fillColor: { kind: "string", max: MAX_COLOR_LENGTH },
    strokeWidth: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    strokeStyle: { kind: "enum", values: STROKE_STYLES },
    rotation: { kind: "number", min: -360, max: 360 },
    opacity: { kind: "number", min: 0, max: 1 },
    isLocked: { kind: "boolean" },
    text: { kind: "string", max: MAX_TEXT_LENGTH },
    textColor: { kind: "string", max: MAX_COLOR_LENGTH },
    fontSize: { kind: "number", min: 1, max: MAX_DIMENSION },
  },
  icon: {
    ...UPDATED,
    iconName: { kind: "string", max: 128, required: true },
    ...POSITION,
    size: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
    rotation: { kind: "number", min: -360, max: 360 },
    flipH: { kind: "boolean" },
    flipV: { kind: "boolean" },
    opacity: { kind: "number", min: 0, max: 1 },
    isLocked: { kind: "boolean" },
    bgShape: { kind: "enum", values: BG_SHAPES },
    bgColor: { kind: "string", max: MAX_COLOR_LENGTH },
  },
  wire: {
    ...UPDATED,
    fromId: { kind: "id", required: true },
    toId: { kind: "id", required: true },
    fromAnchor: { kind: "enum", values: ANCHORS },
    toAnchor: { kind: "enum", values: ANCHORS },
    wireType: { kind: "enum", values: WIRE_TYPES, required: true },
    color: { kind: "string", max: MAX_COLOR_LENGTH, required: true },
    strokeWidth: { kind: "number", required: true, min: 0, max: MAX_DIMENSION },
    strokeStyle: { kind: "enum", values: STROKE_STYLES },
    arrowStart: { kind: "boolean" },
    arrowEnd: { kind: "boolean" },
    label: { kind: "string", max: MAX_TEXT_LENGTH },
  },
};

export function sanitizeElement(value: unknown): SanitizedElement | null {
  if (!isRecord(value)) return null;
  const id = readId(value.id);
  if (!id) return null;
  const type = typeof value.type === "string" && ELEMENT_TYPES.has(value.type) ? value.type : null;
  if (!type) return null;
  const schema = ELEMENT_SCHEMAS[type];
  const fields = applySchema(value, schema);
  if (!fields) return null;
  return { id, type, ...fields };
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
    const id = readId(item);
    if (id) ids.push(id);
  }
  return ids;
}
