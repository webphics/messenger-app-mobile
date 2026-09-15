import type { ApiFailure } from '@/lib/api-result'
import { readNotice, type ReadNotice } from '@/lib/read-notice'

/**
 * What the Communities tab has to say about itself over and above the
 * Communities in it.
 *
 * The four outcomes and the order between them are `lib/read-notice`, shared
 * with a thread's Messages and a Wall's Posts, because the rule that matters is
 * the precedence and it must not drift between the lists that answer it: a
 * failure outranks a load, and rows outrank an empty list.
 *
 * What is here is the copy, and the distinction the copy has to keep. Belonging
 * to no Community and not being able to find out are opposite facts — one is a
 * settled answer about this person, the other is a phone with no signal — and
 * they would otherwise render as the same empty screen.
 *
 * Like a Wall and unlike a thread, there is nothing unconfirmed here: a
 * Community is somewhere somebody was put rather than something they can make,
 * so everything drawn came from the API or from the Store's copy of it, and the
 * same number answers both questions.
 */
export type CommunityNotice = ReadNotice

export type CommunityNoticeInput = {
  /** How many Communities are on screen, Restored ones included. */
  drawn: number
  loading: boolean
  failure: ApiFailure | null
}

const COPY = {
  refusedTitle: 'Could not load communities',
  emptyTitle: 'No communities yet',
  emptyHint: 'Communities you are added to will appear here, with the groups inside them.',
}

export function communityNotice({
  drawn,
  loading,
  failure,
}: CommunityNoticeInput): CommunityNotice {
  return readNotice({ drawn, confirmed: drawn, loading, failure }, COPY)
}

/** What an expanded Community says when its own feed did not arrive. */
export const COMMUNITY_FEED_REFUSED_TITLE = 'Could not load groups'

/**
 * What each named section on the Community screen (#73) says when it has
 * nothing — one line under its header rather than a full notice card, so the
 * two read as different, settled facts about this person rather than as two
 * copies of the same empty state. There is no single unified "no groups"
 * notice beside these: the two sections are always drawn, so a Community
 * with nothing in either is exactly these two lines rather than a third copy.
 */
export const COMMUNITY_JOINED_EMPTY = 'You haven’t joined any groups here yet.'
export const COMMUNITY_JOINABLE_EMPTY = 'No groups to join right now.'
