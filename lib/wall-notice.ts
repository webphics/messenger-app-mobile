import type { ApiFailure } from '@/lib/api-result'
import { readNotice, type ReadNotice } from '@/lib/read-notice'

/**
 * What a Wall has to say about itself over and above its Posts.
 *
 * The four outcomes and the order between them are `lib/read-notice`, shared
 * with a thread's Messages, because the rule that matters is the precedence and
 * it must not drift between the two lists that answer it. What is here is the
 * copy — a Wall's empty screen says nobody has posted rather than that nobody
 * has written — and the one thing about a Wall that makes it simpler than a
 * thread: there are no unconfirmed Posts, because a Post is published rather
 * than sent and there is no Outbox to hold one. So everything drawn came from
 * the API, and the same number answers both questions.
 */
export type WallNotice = ReadNotice

export type WallNoticeInput = {
  /** How many Posts are on screen. */
  drawn: number
  /** The first page, only: paging back and pulling to refresh report themselves. */
  loading: boolean
  failure: ApiFailure | null
}

const COPY = {
  refusedTitle: 'Could not load the Wall',
  emptyTitle: 'Nothing posted yet',
  emptyHint: 'Posts from the organizations you belong to will appear here.',
}

export function wallNotice({ drawn, loading, failure }: WallNoticeInput): WallNotice {
  return readNotice({ drawn, confirmed: drawn, loading, failure }, COPY)
}
