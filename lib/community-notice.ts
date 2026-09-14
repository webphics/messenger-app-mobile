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
 * What the Community screen says when the feed arrived and held nothing the
 * viewer can open.
 *
 * Here rather than in the screen, because this is where the words a Communities
 * surface says live — and because it has to stay distinguishable from the
 * failure above it: a Community with no rooms for this person and one this
 * device could not reach are opposite facts.
 */
export const COMMUNITY_EMPTY = {
  title: 'No groups yet',
  hint: 'Groups you are in appear here, with the community’s announcements.',
}
