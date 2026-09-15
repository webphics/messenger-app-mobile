import type { ApiFailure } from '@/lib/api-result'
import { readNotice, type ReadNotice } from '@/lib/read-notice'

/**
 * What the Saved view has to say about itself over and above the Posts on it.
 *
 * The same four-way precedence every other paged list in this app answers
 * through `lib/read-notice` — a thread's Messages, a Wall's own Posts, and now
 * this one — because the order is what keeps a retry honest and what tells an
 * empty list apart from one this device could not read. Only the copy is this
 * screen's own: nothing here has posted is the wrong sentence for a screen
 * that only ever shows what somebody chose to save.
 */
export type WallBookmarksNotice = ReadNotice

export type WallBookmarksNoticeInput = {
  /** How many Posts are on screen. */
  drawn: number
  /** The first page, only: paging back and pulling to refresh report themselves. */
  loading: boolean
  failure: ApiFailure | null
}

const COPY = {
  refusedTitle: 'Could not load your saved posts',
  emptyTitle: 'Nothing saved yet',
  emptyHint: 'Bookmark a post from the Wall and it will show up here.',
}

export function wallBookmarksNotice({
  drawn,
  loading,
  failure,
}: WallBookmarksNoticeInput): WallBookmarksNotice {
  return readNotice({ drawn, confirmed: drawn, loading, failure }, COPY)
}
