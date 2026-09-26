import type { SessionUser } from '@/lib/types'

/**
 * Whether Support DMs are worked by assignment, or as a Shared queue.
 *
 * Assignment is Engage, Takeover, Transfer and the Unassigned pool: one staff
 * member holds a Support DM and the rest read it. A Shared queue has none of
 * that — every staff member who can see a Support DM may answer it, and nobody
 * holds it. Which one this product is running is a server-wide switch, sent on
 * every role's session, and off unless the API says otherwise.
 *
 * Read here once and handed to the pure rules as a boolean — `inbox-filter`
 * and the rest — rather than read inside them,
 * so that each stays a table and each table can say what it does both ways.
 *
 * `=== true` rather than truthiness, and null for nobody signed in: a session
 * that predates the field, or none at all, is a Shared queue. That is the
 * direction that offers nobody an Engage the API would refuse.
 */
export function isSupportAssignmentEnabled(user: SessionUser | null | undefined): boolean {
  return user?.supportAssignmentEnabled === true
}
