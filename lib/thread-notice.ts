import type { ApiFailure } from '@/lib/conversation-api'
import { readNotice, type ReadNotice } from '@/lib/read-notice'

/**
 * What a thread has to say about itself over and above its Messages.
 *
 * The four outcomes and the order between them are `lib/read-notice`, shared
 * with the Wall since #74 — the precedence is the part that must not drift, and
 * an empty list and an unreachable server mean opposite things on both screens.
 * What is here is the thread's own half: its copy, and the one input a Wall has
 * no use for.
 *
 * `readOnly` is that input. It changes nothing about which notice appears, only
 * what an empty thread invites: a thread this person may write in asks for the
 * first message, and one they may not says nobody has posted.
 */
export type ThreadNotice = ReadNotice

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

export function threadNotice({
  drawn,
  confirmed,
  loading,
  failure,
  readOnly,
}: ThreadNoticeInput): ThreadNotice {
  return readNotice(
    { drawn, confirmed, loading, failure },
    {
      refusedTitle: REFUSED_TITLE,
      emptyTitle: 'No messages yet',
      emptyHint: readOnly
        ? 'Nothing has been posted here yet.'
        : 'Write the first message to start this conversation.',
    },
  )
}
