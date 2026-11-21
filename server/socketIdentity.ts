import type { SanitizedUser } from './auth';

export interface SocketIdentityFields {
  /** Authoritative id used for presence, moderation and room ownership. */
  id: string;
  name: string;
  color: string;
}

const MAX_USER_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 48;

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

function cleanColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '';
}

/**
 * Derive the identity for a socket join from a server-issued account only.
 *
 * Presence broadcasts every participant's id, so a client-supplied `user.id`
 * is public knowledge and cannot be used as proof of identity. Returning null
 * makes the caller reject the join instead of falling back to that id.
 */
export function resolveSocketIdentity(
  authenticatedUser: SanitizedUser | null,
  clientUser: unknown
): SocketIdentityFields | null {
  if (!authenticatedUser || !authenticatedUser.id) return null;

  const provided =
    clientUser && typeof clientUser === 'object'
      ? (clientUser as Record<string, unknown>)
      : {};

  return {
    id: String(authenticatedUser.id).slice(0, MAX_USER_ID_LENGTH),
    name: cleanName(provided.name) || cleanName(authenticatedUser.name) || 'Guest',
    color: cleanColor(provided.color) || cleanColor(authenticatedUser.color) || '#3b82f6',
  };
}
