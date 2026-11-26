export interface AttributionMeta {
  createdBy: string;
  createdByName: string;
  createdByColor: string;
  createdAt: number;
  lastModifiedBy: string;
  lastModifiedByName: string;
  lastModifiedByColor: string;
  lastModifiedAt: number;
}

export interface AttributionActor {
  id: string;
  name: string;
  color: string;
}

interface AttributableRecord {
  id?: string;
  userId?: unknown;
  userName?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  attribution?: Partial<AttributionMeta>;
  [key: string]: unknown;
}

/**
 * Stamps authoritative attribution metadata onto a sanitized canvas element.
 * Preserves the original creator from `existing` (including legacy elements
 * that only had `userId`/`userName` before attribution existed) and records
 * the verified `actor` as `lastModifiedBy`.
 */
export function stampElementAttribution<T extends Record<string, unknown>>(
  clean: T,
  existing: AttributableRecord | undefined,
  actor: AttributionActor,
  now = Date.now()
): T & { attribution: AttributionMeta } {
  const prevAttrib = existing?.attribution;

  const createdBy =
    (typeof prevAttrib?.createdBy === "string" && prevAttrib.createdBy) ||
    (typeof existing?.userId === "string" && existing.userId) ||
    (typeof clean.userId === "string" && clean.userId) ||
    actor.id;

  const createdByName =
    (typeof prevAttrib?.createdByName === "string" && prevAttrib.createdByName) ||
    (typeof existing?.userName === "string" && existing.userName) ||
    (typeof clean.userName === "string" && clean.userName) ||
    actor.name;

  const createdByColor =
    (typeof prevAttrib?.createdByColor === "string" && prevAttrib.createdByColor) ||
    actor.color;

  const createdAt =
    (typeof prevAttrib?.createdAt === "number" && Number.isFinite(prevAttrib.createdAt) ? prevAttrib.createdAt : undefined) ??
    (typeof existing?.createdAt === "number" && Number.isFinite(existing.createdAt) ? existing.createdAt : undefined) ??
    (typeof existing?.updatedAt === "number" && Number.isFinite(existing.updatedAt) ? existing.updatedAt : undefined) ??
    (typeof clean.createdAt === "number" && Number.isFinite(clean.createdAt) ? clean.createdAt : undefined) ??
    (typeof clean.updatedAt === "number" && Number.isFinite(clean.updatedAt) ? clean.updatedAt : undefined) ??
    now;

  return {
    ...clean,
    attribution: {
      createdBy,
      createdByName,
      createdByColor,
      createdAt,
      lastModifiedBy: actor.id,
      lastModifiedByName: actor.name,
      lastModifiedByColor: actor.color,
      lastModifiedAt: now,
    },
  };
}
