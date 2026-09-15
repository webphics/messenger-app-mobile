import type { ApiFailure } from '@/lib/api-result'
import type { CommunityJoinableGroupRow } from '@/lib/types'

/**
 * The one button on a Group nobody is in (#73).
 *
 * Pure, like every decision table in this app: what the button says and
 * whether it does anything are read off the row rather than derived from a
 * tap. A pending ask offers nothing to tap — taking one back is #88's — so
 * this only ever has to say *Requested* and stop there.
 */

/** What the join control says, for every combination `joinPolicy`/`joinState` can be in. */
export function joinButtonLabel(row: CommunityJoinableGroupRow): string {
  if (row.joinState === 'pending') return 'Requested'
  return row.joinPolicy === 'open' ? 'Join' : 'Ask to join'
}

/** Whether tapping the join control does anything. A pending ask has nothing further to say yet. */
export function canRequestJoin(row: CommunityJoinableGroupRow): boolean {
  return row.joinState !== 'pending'
}

/**
 * One sentence for a join, or a leave, the API refused.
 *
 * The convention every write in this app follows: an expired session says
 * nothing here, because the auth layer is already on its way to sign-in, and a
 * sentence about a Group or a Community would arrive on a screen that is
 * leaving.
 */
export function communityActionRefusal(failure: ApiFailure): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return 'That could not be sent.'
}
