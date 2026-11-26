import type { AttributionMeta, CanvasElement, RemoteUser } from '../types';

/**
 * Attribution colour utilities.
 *
 * Each user is assigned a stable accent colour derived deterministically from
 * their userId so the same user always gets the same colour across sessions and
 * devices. The palette is designed to be visually distinct and contrast well
 * against both light and dark canvas backgrounds.
 */

const PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#10b981', // emerald
  '#6366f1', // indigo
];

/** Simple djb2-style hash that works in all browsers without crypto. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

/**
 * Returns a stable hex colour for a userId.
 * If the user already has a preferred colour stored (from guestIdentity /
 * auth), that is returned directly; otherwise a palette colour is derived
 * from the userId hash.
 */
export function attributionColorForUser(userId: string, preferredColor?: string): string {
  if (preferredColor && preferredColor.startsWith('#') && preferredColor.length >= 4) {
    return preferredColor;
  }
  return PALETTE[hashString(userId) % PALETTE.length];
}

/**
 * Returns a CSS rgba() string with reduced opacity — used for blame-mode
 * tint overlays so the original element colour still shows through.
 */
export function blameOverlayColor(hexColor: string, alpha = 0.22): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(99,102,241,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Stamps attribution metadata onto a locally created/updated element (used for
 * optimistic UI updates and Solo Mode persistence). Preserves `createdBy*` from
 * `existing` when available.
 */
export function stampLocalAttribution<T extends CanvasElement>(
  element: T,
  existing: CanvasElement | undefined,
  actor: { id: string; name: string; color?: string },
  now = Date.now()
): T {
  const prevAttrib = existing?.attribution;
  const legacyCreatorId = existing?.userId ?? element.userId ?? actor.id;
  const legacyCreatorName =
    (existing && 'userName' in existing ? existing.userName : undefined) ??
    ('userName' in element ? element.userName : undefined) ??
    actor.name;
  const actorColor = attributionColorForUser(actor.id, actor.color);
  const fallbackCreatedAt =
    (existing && 'createdAt' in existing ? existing.createdAt : undefined) ??
    (existing && 'updatedAt' in existing ? existing.updatedAt : undefined) ??
    ('createdAt' in element ? element.createdAt : undefined) ??
    ('updatedAt' in element ? element.updatedAt : undefined) ??
    now;

  const attribution: AttributionMeta = {
    createdBy: prevAttrib?.createdBy ?? legacyCreatorId,
    createdByName: prevAttrib?.createdByName ?? legacyCreatorName ?? 'Unknown',
    createdByColor: prevAttrib?.createdByColor ?? attributionColorForUser(legacyCreatorId, legacyCreatorId === actor.id ? actor.color : undefined),
    createdAt: prevAttrib?.createdAt ?? fallbackCreatedAt,
    lastModifiedBy: actor.id,
    lastModifiedByName: actor.name,
    lastModifiedByColor: actorColor,
    lastModifiedAt: now,
  };

  return {
    ...element,
    attribution,
  };
}

/**
 * Resolves attribution for any element, falling back cleanly for legacy
 * elements that predate the `attribution` field.
 */
export function getEffectiveAttribution(
  element: CanvasElement,
  users?: Record<string, RemoteUser>
): AttributionMeta {
  if (element.attribution) {
    return element.attribution;
  }

  const creatorId = element.userId || 'unknown';
  const knownUser = users?.[creatorId];
  const rawName = ('userName' in element ? element.userName : undefined) || knownUser?.name || 'Collaborator';
  const color = attributionColorForUser(creatorId, knownUser?.color);
  const timestamp =
    ('updatedAt' in element ? element.updatedAt : undefined) ??
    ('createdAt' in element ? element.createdAt : undefined) ??
    Date.now();

  return {
    createdBy: creatorId,
    createdByName: rawName,
    createdByColor: color,
    createdAt: timestamp,
    lastModifiedBy: creatorId,
    lastModifiedByName: rawName,
    lastModifiedByColor: color,
    lastModifiedAt: timestamp,
  };
}

/** Format a Unix ms timestamp as a human-readable relative string. */
export function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

/** Format a Unix ms timestamp as HH:MM. */
export function shortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
