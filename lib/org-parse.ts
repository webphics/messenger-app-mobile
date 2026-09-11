import { asRecord } from '@/lib/api-envelope'
import type {
  CustomInbox,
  Invitation,
  InviteOutcome,
  Organization,
  OrganizationMember,
  OrganizationSummary,
} from '@/lib/types'

/**
 * Reading the organization, membership and inbox payloads.
 *
 * Pure, and separate from the requests, for the reason `lib/conversation-parse`
 * is: what the API sends becomes a table of cases rather than something only a
 * running server can demonstrate. The same two rules hold here — a row this
 * client cannot read is dropped from a list rather than failing the page, and
 * what is required is only what the app would otherwise be inventing.
 *
 * Counts are the one thing that falls back rather than dropping the row. An
 * organization whose member count did not arrive is still an organization
 * worth listing; showing it with a zero would be a claim, so the screens read
 * the count as the number it is and the API always sends one.
 */

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    return record ? [record] : []
  })
}

/** Rows off a `{ rows: [...] }` envelope, which is how every list here answers. */
function rows(value: unknown): Record<string, unknown>[] {
  return records(asRecord(value)?.rows)
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function parseOrganization(value: unknown): Organization | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const name = text(record.name)
  return id && name ? { id, name } : null
}

export function parseOrganizationSummary(value: unknown): OrganizationSummary | null {
  const record = asRecord(value)
  const base = parseOrganization(record)
  if (!record || !base) return null

  return {
    ...base,
    memberCount: count(record.memberCount),
    conversationCount: count(record.conversationCount),
    createdAt: timestamp(record.createdAt) ?? '',
    updatedAt: timestamp(record.updatedAt) ?? '',
  }
}

export function parseOrganizationSummaries(value: unknown): OrganizationSummary[] {
  return rows(value).flatMap((item) => {
    const organization = parseOrganizationSummary(item)
    return organization ? [organization] : []
  })
}

export function parseOrganizationMembers(value: unknown): OrganizationMember[] {
  return rows(value).flatMap((item) => {
    const id = text(item.id)
    const name = text(item.name)
    // A role this client does not recognise is still a role the API means; it
    // is printed rather than matched on, so it is kept as the string it is.
    const role = text(item.role)
    return id && name && role ? [{ id, name, role }] : []
  })
}

export function parseInvitations(value: unknown): Invitation[] {
  return rows(value).flatMap((item) => {
    const id = text(item.id)
    const organization = parseOrganization(item.organization)
    return id && organization
      ? [{ id, organization, createdAt: timestamp(item.createdAt) ?? '' }]
      : []
  })
}

function organizationList(value: unknown): Organization[] {
  return records(value).flatMap((item) => {
    const organization = parseOrganization(item)
    return organization ? [organization] : []
  })
}

export function parseInviteOutcome(value: unknown): InviteOutcome | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    invited: organizationList(record.invited),
    alreadyMembers: organizationList(record.alreadyMembers),
    alreadyInvited: organizationList(record.alreadyInvited),
  }
}

export function parseCustomInbox(value: unknown): CustomInbox | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const name = text(record.name)
  if (!id || !name) return null

  return {
    id,
    name,
    organizationIds: Array.isArray(record.organizationIds)
      ? record.organizationIds.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export function parseCustomInboxes(value: unknown): CustomInbox[] {
  return rows(value).flatMap((item) => {
    const inbox = parseCustomInbox(item)
    return inbox ? [inbox] : []
  })
}

/**
 * A `{ deleted: true }`, `{ removed: true }` or `{ accepted: true }` body.
 *
 * The flag is the whole payload and nothing reads it back — the status code
 * already said it worked — so what this answers is that the envelope was
 * well formed, which is what separates a real acknowledgement from a body this
 * client could not parse.
 */
export function parseAcknowledgement(value: unknown): true | null {
  return asRecord(value) ? true : null
}
