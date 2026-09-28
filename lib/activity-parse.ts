import { asRecord } from '@/lib/api-envelope'
import type { ActivityEvent, ActivityPage, ActivityPerson, UserRole } from '@/lib/types'

/**
 * Reading `GET /activity`.
 *
 * Pure, and separate from the request, for the reason every other parser in
 * this app is. Nothing in the feed is acted on — a row is a sentence and a
 * time — so the rule is the lenient one: a row needs an id, a kind and a
 * timestamp to be drawn at all, and everything else falls back. A person who
 * cannot be read becomes "a deleted account" in the sentence rather than
 * taking the row with them.
 */

const ROLES: readonly UserRole[] = ['admin', 'agent', 'customer']
const ACTOR_ROLES: readonly (UserRole | 'system')[] = [...ROLES, 'system']

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function person(value: unknown): ActivityPerson | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const name = text(record.name)
  const role = oneOf(record.role, ROLES)
  return id && name && role ? { id, name, role } : null
}

export function parseActivityEvent(value: unknown): ActivityEvent | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const kind = text(record.kind)
  const at = text(record.at)
  if (!id || !kind || !at || Number.isNaN(Date.parse(at))) return null

  return {
    id,
    kind,
    // An unknown role reads as the system rather than as a person nobody can
    // name: the sentence then says "The system", which is less wrong than
    // "A deleted account" for a row whose actor was never an account.
    actorRole: oneOf(record.actorRole, ACTOR_ROLES) ?? 'system',
    actor: person(record.actor),
    targetType: text(record.targetType) ?? 'unknown',
    target: person(record.target),
    targetLabel: text(record.targetLabel),
    metadata: asRecord(record.metadata) ?? {},
    at,
  }
}

/**
 * One page of the feed. `GET /activity` answers `{ rows, total, page, pageSize }`.
 *
 * A body without a `rows` array is not this payload, and answers null so the
 * screen says it could not read the reply rather than showing an empty feed.
 * Rows it cannot read are dropped one at a time.
 */
export function parseActivityPage(value: unknown): ActivityPage | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.rows)) return null

  const events = record.rows.flatMap((item: unknown) => {
    const event = parseActivityEvent(item)
    return event ? [event] : []
  })

  return {
    events,
    total: count(record.total, events.length),
    page: count(record.page, 1),
    pageSize: count(record.pageSize, events.length),
  }
}
