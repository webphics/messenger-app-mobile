import { asRecord } from '@/lib/api-envelope'
import { WEB_ORIGIN } from '@/lib/legal-links'

/**
 * Organization join links: a link that, opened by somebody signed in, makes
 * them a member of every organization it names (API ADR 0012).
 *
 * The Admin's side only — generating, listing, sharing and revoking. Opening a
 * link is the web client's `/join` page; this build does not redeem one.
 *
 * Pure and free of React and the transport, so what the API sends and what a
 * row says about it are table rows. `lib/join-link-api` is the requests.
 */

export const JOIN_LINK_USAGE_MODES = ['single_use', 'unlimited'] as const
export type JoinLinkUsageMode = (typeof JOIN_LINK_USAGE_MODES)[number]

/**
 * Derived by the API on read. Only `active` can still be redeemed; the other
 * three are the reason it cannot, which the Admin who made it is owed.
 */
export const JOIN_LINK_STATUSES = ['active', 'used', 'expired', 'revoked'] as const
export type JoinLinkStatus = (typeof JOIN_LINK_STATUSES)[number]

export type JoinLinkOrganization = { id: string; name: string }

export type JoinLink = {
  id: string
  /** Plaintext on purpose: the author has to be able to share the same link again. */
  token: string
  organizations: JoinLinkOrganization[]
  usageMode: JoinLinkUsageMode
  useCount: number
  status: JoinLinkStatus
  expiresAt: string
  revokedAt: string | null
  createdByName: string | null
  createdAt: string
}

/** The three expiries the API accepts; anything else it refuses, so nothing else is offered. */
export const JOIN_LINK_EXPIRY_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
] as const
export type JoinLinkExpiryHours = (typeof JOIN_LINK_EXPIRY_OPTIONS)[number]['hours']
export const DEFAULT_JOIN_LINK_EXPIRY_HOURS: JoinLinkExpiryHours = 24

export const JOIN_LINK_USAGE_OPTIONS: readonly {
  mode: JoinLinkUsageMode
  label: string
  hint: string
}[] = [
  {
    mode: 'single_use',
    label: 'Single use',
    hint: 'Spent by the first person who opens it.',
  },
  {
    mode: 'unlimited',
    label: 'Unlimited',
    hint: 'Anyone holding it can join until it expires or is revoked.',
  },
]

const STATUS_LABELS: Record<JoinLinkStatus, string> = {
  active: 'Active',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Revoked',
}

export function joinLinkStatusLabel(status: JoinLinkStatus): string {
  return STATUS_LABELS[status]
}

export function joinLinkUsageLabel(mode: JoinLinkUsageMode): string {
  return mode === 'single_use' ? 'Single use' : 'Unlimited'
}

/**
 * Only a live link is worth handing to anybody or revoking: a dead one would
 * land somebody on a page saying it is no good, and revoking it changes nothing.
 */
export function isJoinLinkLive(link: Pick<JoinLink, 'status'>): boolean {
  return link.status === 'active'
}

/**
 * The URL a person opens. The API never sends one, only the token, because the
 * origin belongs to the web client — the same page its own Join links screen
 * copies.
 */
export function joinLinkUrl(token: string, origin: string = WEB_ORIGIN): string {
  return `${origin}/join?token=${encodeURIComponent(token)}`
}

/** "Acme, Globex and Initech", for the line under a link and the share message. */
export function joinLinkOrganizationNames(link: Pick<JoinLink, 'organizations'>): string {
  const names = link.organizations.map((organization) => organization.name)
  if (names.length === 0) return 'No organizations'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What the share sheet carries: who it is for, then the link. */
export function joinLinkShareMessage(link: Pick<JoinLink, 'organizations' | 'token'>): string {
  return `Join ${joinLinkOrganizationNames(link)} on ChatRoute: ${joinLinkUrl(link.token)}`
}

/**
 * The second line of a row: usage, how many joined, and when it stops — or,
 * for a dead link, when it stopped being any good.
 */
export function joinLinkDetail(link: JoinLink, formatDate: (iso: string) => string): string {
  const uses = `${link.useCount} ${link.useCount === 1 ? 'use' : 'uses'}`
  const when =
    link.status === 'revoked' && link.revokedAt
      ? `Revoked ${formatDate(link.revokedAt)}`
      : link.status === 'active'
        ? `Expires ${formatDate(link.expiresAt)}`
        : link.status === 'expired'
          ? `Expired ${formatDate(link.expiresAt)}`
          : null
  return [joinLinkUsageLabel(link.usageMode), uses, when].filter(Boolean).join(' · ')
}

/** "Nov 24, 3:00 PM" in the device's locale; an unreadable timestamp is said to be one. */
export function formatJoinLinkDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'at an unknown time'
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

/** Live links first, then newest first within each half. */
export function orderedJoinLinks(links: readonly JoinLink[]): JoinLink[] {
  return [...links].sort((a, b) => {
    const live = Number(isJoinLinkLive(b)) - Number(isJoinLinkLive(a))
    if (live !== 0) return live
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** One link written into the list: replaced where it was, otherwise added. */
export function withJoinLink(links: readonly JoinLink[], link: JoinLink): JoinLink[] {
  return links.some((row) => row.id === link.id)
    ? links.map((row) => (row.id === link.id ? link : row))
    : [link, ...links]
}

// --- Parsing -------------------------------------------------------------

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function parseOrganizations(value: unknown): JoinLinkOrganization[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    const id = text(record?.id)
    const name = text(record?.name)
    return id && name ? [{ id, name }] : []
  })
}

/**
 * One link, or null. What is required is what a row cannot be drawn or acted
 * on without: the id to revoke, the token to share, the status and the expiry.
 * A status this build does not know drops the row rather than drawing it as
 * live, since a live row offers to share a link that may be dead.
 */
export function parseJoinLink(value: unknown): JoinLink | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const token = text(record.token)
  const status = oneOf(JOIN_LINK_STATUSES, record.status)
  const usageMode = oneOf(JOIN_LINK_USAGE_MODES, record.usageMode)
  const expiresAt = text(record.expiresAt)
  if (!id || !token || !status || !usageMode || !expiresAt) return null

  return {
    id,
    token,
    organizations: parseOrganizations(record.organizations),
    usageMode,
    useCount:
      typeof record.useCount === 'number' && Number.isFinite(record.useCount)
        ? record.useCount
        : 0,
    status,
    expiresAt,
    revokedAt: text(record.revokedAt),
    createdByName: text(record.createdByName),
    createdAt: text(record.createdAt) ?? '',
  }
}

/** A page of links. Unreadable rows are dropped; a body with no `rows` array is malformed. */
export function parseJoinLinks(value: unknown): JoinLink[] | null {
  const rows = asRecord(value)?.rows
  if (!Array.isArray(rows)) return null
  return rows.flatMap((row) => {
    const link = parseJoinLink(row)
    return link ? [link] : []
  })
}

export function parseRevoked(value: unknown): boolean | null {
  const revoked = asRecord(value)?.revoked
  return typeof revoked === 'boolean' ? revoked : null
}
