import type { ApiFailure } from '@/lib/api-result'
import { readNotice, type ReadNotice } from '@/lib/read-notice'

/**
 * What the Post notification card has to say about itself over and above the
 * switches, and what a switch that did not take says beside it.
 *
 * The four outcomes and the order between them are `lib/read-notice`, shared
 * with a thread's Messages and a Wall's Posts, because the precedence is the
 * part that must not drift: a failure outranks a load, and rows outrank an
 * empty list — so asking again over switches that are already drawn leaves them
 * drawn rather than blanking the card to report a request. What is here is the
 * copy, and the one thing that makes this card simpler than either list: every
 * switch came from the API, so the same number answers both of `readNotice`'s
 * questions.
 *
 * The distinction it is here for is the same one: a person who is in no
 * organization and a person whose memberships could not be read would otherwise
 * render identically, and they mean opposite things — one has nothing to choose
 * between, the other has not been told.
 */
export type PostNotificationsNotice = ReadNotice

export type PostNotificationsNoticeInput = {
  /** How many switches are on screen. */
  drawn: number
  loading: boolean
  failure: ApiFailure | null
}

const COPY = {
  refusedTitle: 'Could not load Post notifications',
  emptyTitle: 'No organizations',
  emptyHint: 'You are not in an organization yet, so there is nothing to be notified about.',
}

export function postNotificationsNotice({
  drawn,
  loading,
  failure,
}: PostNotificationsNoticeInput): PostNotificationsNotice {
  return readNotice({ drawn, confirmed: drawn, loading, failure }, COPY)
}

/**
 * One sentence for a switch that went back, or nothing.
 *
 * Not `readRefusal`, for the reason it is not `failureNotice` either: those two
 * speak about a read that did not arrive, and this is a write that did not take
 * — "this is what this device already had" is true of a list and false of a
 * switch, which is showing what it was rather than what it holds.
 *
 * An expired session says nothing, exactly as it says nothing about a page or an
 * Engage: the auth layer is already on its way to sign-in, and a line about a
 * switch would arrive on a screen that is leaving.
 */
export function postNotificationsRefusal(failure: ApiFailure): string | null {
  switch (failure.kind) {
    case 'unreachable':
      return 'No connection. That could not be saved.'
    case 'refused':
      return failure.message
    case 'malformed':
      return 'The server answered with something this app did not understand.'
    case 'unauthorised':
      return null
  }
}
