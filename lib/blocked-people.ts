import { asRecord } from '@/lib/api-envelope'

/**
 * The people somebody has blocked, as `GET /blocks` answers them
 * (`docs/api/blocks.md` in messenger-api), and the list rules the app keeps
 * them by.
 *
 * The API is what enforces a block: it leaves the blocked person's Posts and
 * Messages out of every list it answers the blocker with, and refuses them a
 * new direct message. This list is for the two things the API cannot do from
 * where it stands — taking what is already on this phone's screen down the
 * moment the block lands, and dropping a live Post the socket broadcasts to a
 * whole Organization room.
 */

export type BlockedPerson = {
  id: string
  name: string
  image: string | null
  blockedAt: string
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** One row, from either a list row or the answer to `POST /blocks`. */
export function parseBlockedPerson(data: unknown): BlockedPerson | null {
  const row = asRecord(data)
  const user = asRecord(row?.user)
  const id = text(user?.id)
  const name = text(user?.name)
  const blockedAt = text(row?.blockedAt)
  if (!id || !name || !blockedAt) return null
  return { id, name, image: text(user?.image), blockedAt }
}

export function parseBlockedPeople(data: unknown): BlockedPerson[] | null {
  const rows = asRecord(data)?.rows
  if (!Array.isArray(rows)) return null
  return rows
    .map(parseBlockedPerson)
    .filter((person): person is BlockedPerson => person !== null)
}

export function parseUnblocked(data: unknown): { userId: string } | null {
  const userId = text(asRecord(data)?.userId)
  return userId ? { userId } : null
}

/** Newest first and nobody twice — a second block of the same person replaces the first row. */
export function withBlockedPerson(list: readonly BlockedPerson[], person: BlockedPerson): BlockedPerson[] {
  return [person, ...list.filter(existing => existing.id !== person.id)]
}

export function withoutBlockedPerson(list: readonly BlockedPerson[], userId: string): BlockedPerson[] {
  return list.filter(existing => existing.id !== userId)
}

/**
 * Whether somebody was unblocked between two readings of the list. What the
 * API left out of its pages while the block stood is not on this phone, so a
 * screen that sees this re-reads rather than waiting for a pull.
 */
export function unblockedSince(previous: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  for (const id of previous) if (!next.has(id)) return true
  return false
}

/** The ids the screens filter by. */
export function blockedIdSet(list: readonly BlockedPerson[]): ReadonlySet<string> {
  return new Set(list.map(person => person.id))
}
