import type { ApiFailure } from '@/lib/api-result'
import type { CommunityJoinableGroupRow } from '@/lib/types'

/**
 * The one button on a Group nobody is in (#73, and #88's withdraw).
 *
 * Pure, like every decision table in this app: what the button says and what
 * a tap on it does are read off the row rather than derived from the tap
 * itself. Two actions, never three: a pending ask has nothing left to *ask*
 * for, so the same button that opened it is the one that takes it back.
 */

export type JoinRowAction = 'join' | 'withdraw'

/** Which of the two the button does. Always one of them — there is no third, inert state. */
export function joinRowAction(row: CommunityJoinableGroupRow): JoinRowAction {
  return row.joinState === 'pending' ? 'withdraw' : 'join'
}

/** What the join control says, for every combination `joinPolicy`/`joinState` can be in. */
export function joinButtonLabel(row: CommunityJoinableGroupRow): string {
  if (row.joinState === 'pending') return 'Withdraw'
  return row.joinPolicy === 'open' ? 'Join' : 'Ask to join'
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
