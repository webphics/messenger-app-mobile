import type { ApiFailure } from '@/lib/conversation-api'
import { failureNotice, readRefusal } from '@/lib/conversation-failure'

/**
 * What a thread has to say about itself over and above its Messages.
 *
 * Four outcomes and nothing, because the distinction worth keeping is between a
 * thread that has nothing to show and one that could not find out: an empty
 * conversation and an unreachable server would otherwise render identically,
 * and they mean opposite things — one says nobody has written anything, the
 * other says this device does not know.
 *
 * `stale` is the one that is not a placeholder. Messages are drawn, what is
 * drawn is still true, and a notice that replaced them would throw away the
 * thread to report a request — so the failure sits beside them in one line, the
 * way a send failure sits beside a bubble marked *Not sent*, and is dismissed
 * the same way.
 */
export type ThreadNotice =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'empty'; title: string; hint: string }
  | { kind: 'failed'; title: string; hint: string }
  | { kind: 'stale'; message: string }

export type ThreadNoticeInput = {
  /** Everything on screen, an Unsent Message of this person's own included. */
  drawn: number
  /**
   * How much of what is drawn came from the API.
   *
   * Separate from `drawn` because the two questions differ: whether the thread
   * looks empty is about anything at all being there, and whether a failure can
   * be reduced to one line is about the server having answered at least once. A
   * thread whose only bubble is a Message that never got away has been read by
   * nobody, and a strip over it would report the failure in the corner of a
   * screen that has nothing else to say.
   */
  confirmed: number
  /** The first page, only: paging older and pulling to refresh report themselves. */
  loading: boolean
  failure: ApiFailure | null
  /** Whether this person may write here, which changes what an empty thread invites. */
  readOnly: boolean
}

const REFUSED_TITLE = 'Could not load this conversation'

/**
 * A failure outranks a load, and Messages outrank an empty thread.
 *
 * The order is what keeps a retry honest: it clears the failure and puts the
 * thread back into loading, so the notice it replaces is a spinner rather than
 * the same notice again until the answer arrives.
 */
export function threadNotice({
  drawn,
  confirmed,
  loading,
  failure,
  readOnly,
}: ThreadNoticeInput): ThreadNotice {
  if (failure) {
    if (confirmed === 0) return { kind: 'failed', ...failureNotice(failure, REFUSED_TITLE) }
    const message = readRefusal(failure)
    return message ? { kind: 'stale', message } : { kind: 'none' }
  }

  if (drawn > 0) return { kind: 'none' }
  if (loading) return { kind: 'loading' }

  return {
    kind: 'empty',
    title: 'No messages yet',
    hint: readOnly
      ? 'Nothing has been posted here yet.'
      : 'Write the first message to start this conversation.',
  }
}
