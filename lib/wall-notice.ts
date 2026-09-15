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
  /**
   * Whether this is a shared, named Wall rather than the default one.
   *
   * The empty copy is the one thing that has to differ: a default Wall with
   * nothing on it means nobody in your organizations has posted, but a named
   * Wall reading empty most often means its organizations are not yours — the
   * one acceptance criterion #79 has for this screen is that this reads as a
   * view with nothing in it rather than as a refusal, and the default copy's
   * "organizations you belong to" would claim the opposite of what happened.
   */
  named?: boolean
  /**
   * The term somebody searched for, when this is a search result rather than
   * the Wall itself (#80).
   *
   * Its own branch rather than a third boolean beside `named`: an empty
   * search result and an empty Wall mean opposite things — one says nothing
   * matched what was typed, the other says nobody has posted at all — and a
   * screen with the term in hand is how #80's "distinguishable from no search
   * having been run" is kept true. That distinction is also why this is never
   * reached with an empty string: `lib/use-wall`'s search only runs once
   * somebody has typed something, so an unsearched Wall reads through `named`
   * (or neither) instead.
   */
  searching?: string
}

const COPY = {
  refusedTitle: 'Could not load the Wall',
  emptyTitle: 'Nothing posted yet',
  emptyHint: 'Posts from the organizations you belong to will appear here.',
}

const NAMED_COPY = {
  refusedTitle: 'Could not load this Wall',
  emptyTitle: 'Nothing to show',
  emptyHint:
    'Either nobody here has posted yet, or none of its organizations overlap with yours.',
}

/** Built per search rather than a constant, since the hint quotes the term back. */
function searchCopy(term: string): typeof COPY {
  return {
    refusedTitle: 'Could not search the Wall',
    emptyTitle: 'No posts matched',
    emptyHint: `Nothing found for “${term}”. Try a different word.`,
  }
}

export function wallNotice({ drawn, loading, failure, named, searching }: WallNoticeInput): WallNotice {
  const copy = searching !== undefined ? searchCopy(searching) : named ? NAMED_COPY : COPY
  return readNotice({ drawn, confirmed: drawn, loading, failure }, copy)
}
