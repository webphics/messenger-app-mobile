import { asRecord } from '@/lib/api-envelope'
import { parseCapabilities } from '@/lib/capabilities'
import { parseOrganization } from '@/lib/org-parse'
import type { ManagedUser, Organization, StaffPermissions, UserRole } from '@/lib/types'

/**
 * Reading the Admin user-management payloads.
 *
 * Pure, and separate from the requests, for the reason every other parser in
 * this app is. The rule about what is required is stricter here than
 * elsewhere: a row in this directory is something an Admin acts *on* — bans,
 * role changes, session revocations — so a row missing its id, its email or
 * its role is dropped rather than defaulted. Defaulting a role would put a
 * control on screen that acts on the wrong assumption about who somebody is.
 *
 * Everything else falls back, because the alternative to a missing phone
 * number is a person who vanishes from the directory.
 */

const ROLES: readonly UserRole[] = ['admin', 'agent', 'customer']

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function flag(value: unknown): boolean {
  return value === true
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    return record ? [record] : []
  })
}

function organizations(value: unknown): Organization[] {
  return records(value).flatMap((item) => {
    const organization = parseOrganization(item)
    return organization ? [organization] : []
  })
}

function invitations(value: unknown): { id: string; organization: Organization }[] {
  return records(value).flatMap((item) => {
    const id = text(item.id)
    const organization = parseOrganization(item.organization)
    return id && organization ? [{ id, organization }] : []
  })
}

export function parseManagedUser(value: unknown): ManagedUser | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const email = text(record.email)
  const role = oneOf(record.role, ROLES)
  if (!id || !email || !role) return null

  return {
    id,
    // Null rather than the email: a person who never set a name is drawn as
    // their email by the screen, which is a decision about presentation and
    // belongs there rather than here.
    name: text(record.name),
    email,
    phone: text(record.phone),
    role,
    emailVerified: flag(record.emailVerified),
    is2faEnabled: flag(record.is2faEnabled),
    isBanned: flag(record.isBanned),
    banReason: text(record.banReason),
    banExpires: text(record.banExpires),
    activeSessionCount: count(record.activeSessionCount),
    organizations: organizations(record.organizations),
    pendingInvitations: invitations(record.pendingInvitations),
    declinedInvitations: invitations(record.declinedInvitations),
    createdAt: text(record.createdAt) ?? '',
    updatedAt: text(record.updatedAt) ?? '',
    // Only an explicit false locks a row. An older API sends no flag, and
    // reading its absence as false would take every action off every row.
    manageable: record.manageable !== false,
  }
}

/** One page of the directory. `GET /users` answers `{ rows, total, page, pageSize }`. */
export function parseManagedUsers(value: unknown): ManagedUser[] {
  return records(asRecord(value)?.rows).flatMap((item) => {
    const user = parseManagedUser(item)
    return user ? [user] : []
  })
}

/** How many rows the query matched, which is not how many arrived in this page. */
export function parseUserTotal(value: unknown): number {
  return count(asRecord(value)?.total)
}

/**
 * `GET` and `PATCH /users/:id/permissions`. A body with no known role or no
 * held list is not this payload. A missing `editable` reads as nothing
 * editable, which fails towards offering no toggle the API would refuse.
 */
export function parseStaffPermissions(value: unknown): StaffPermissions | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.capabilities)) return null
  const role = oneOf(record.role, ROLES)
  if (!role) return null
  return {
    role,
    capabilities: parseCapabilities(record.capabilities),
    editable: parseCapabilities(record.editable),
  }
}

/**
 * A `{ revokedCount }`, `{ deleted }` or `{ updated }` body.
 *
 * Nothing reads the number back — the status code already said it worked — so
 * what this answers is that the envelope was well formed, which is what
 * separates an acknowledgement from a body this client could not parse.
 */
export function parseUserAcknowledgement(value: unknown): true | null {
  return asRecord(value) ? true : null
}
