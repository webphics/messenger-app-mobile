import { formatRelativeTime } from '@/lib/display'
import type { Organization, StaffDirectoryUser } from '@/lib/types'

/**
 * Reading the staff directory: who can be written to, and what starting a
 * conversation with them binds to.
 *
 * A staff DM belongs to an organization the two people share, and the directory
 * row is what says which. The rules below are the client's half of the API's:
 * one shared organization binds silently, several have to be chosen between,
 * and none means no conversation can exist — which the row says before a round
 * trip rather than after one.
 *
 * Several is not the rare case it sounds like. The API counts an Admin as a
 * member of every organization on both sides of the intersection, so an Admin on
 * a multi-organization team gets the choice on every row, and asking up front is
 * what keeps that from being a refusal they have to read first.
 */

/** What tapping a name in the directory does next. */
export type StaffDmIntent =
  /** One candidate, or none named: start the conversation now. */
  | { kind: 'start'; organizationId?: string }
  /** Several candidates: the person picks which organization it belongs to. */
  | { kind: 'choose'; organizations: Organization[] }
  /** No shared organization, so no conversation can exist. */
  | { kind: 'impossible' }

export function staffDmIntent(user: StaffDirectoryUser): StaffDmIntent {
  const shared = user.sharedOrganizations
  // Null is the API not having said, which `GET /conversations/staff` does not
  // do today — the field is optional on the shape rather than on this endpoint.
  // An unanswered question is still not an answer of none, so the request goes
  // out and the API decides, as it does for a Customer's support thread.
  if (shared === null) return { kind: 'start' }
  if (shared.length === 0) return { kind: 'impossible' }
  if (shared.length === 1) return { kind: 'start', organizationId: shared[0]!.id }
  return { kind: 'choose', organizations: shared }
}

/** The directory as the search field leaves it. Matches a name or a role. */
export function filterStaff(
  users: StaffDirectoryUser[],
  query: string,
): StaffDirectoryUser[] {
  const q = query.trim().toLowerCase()
  if (!q) return users
  return users.filter(
    (user) => user.name.toLowerCase().includes(q) || user.role.toLowerCase().includes(q),
  )
}

/**
 * What to say under a name.
 *
 * Presence is optional on the payload, so a row that carries none says nothing
 * rather than claiming the person is offline — an absent field is not a report.
 */
export function presenceLabel(user: StaffDirectoryUser, nowMs = Date.now()): string {
  if (user.isOnline) return 'Active now'
  const lastOnlineAt = user.lastOnlineAt
  if (lastOnlineAt) return `Active ${formatRelativeTime(lastOnlineAt, nowMs)}`
  return user.isOnline === false ? 'Offline' : ''
}
