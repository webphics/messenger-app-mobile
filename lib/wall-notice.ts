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
  /**
   * The kind the Wall is narrowed to, when it is narrowed at all (#54's kinds).
   *
   * Its own branch for the reason `searching` is one: a Wall filtered to
   * Giveaways with nothing in it has not run out of Posts, it has run out of
   * *those* Posts, and the default copy's "nobody has posted" would send a
   * reader looking for a fault that is a filter they set two taps ago.
   */
  filteredTo?: string
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

/** Built per filter, since the hint names the kind that is hiding the rest. */
function filteredCopy(label: string): typeof COPY {
  return {
    refusedTitle: 'Could not load the Wall',
    emptyTitle: `No ${label.toLowerCase()} posts`,
    emptyHint: `Nothing here is a ${label.toLowerCase()} post yet. Choose All to see everything.`,
  }
}

export function wallNotice({
  drawn,
  loading,
  failure,
  named,
  searching,
  filteredTo,
}: WallNoticeInput): WallNotice {
  // Search first: a search result is never also filtered — `lib/use-wall` reads
  // a search through its own path, which passes no kind at all.
  const copy =
    searching !== undefined
      ? searchCopy(searching)
      : filteredTo !== undefined
        ? filteredCopy(filteredTo)
        : named
          ? NAMED_COPY
          : COPY
  return readNotice({ drawn, confirmed: drawn, loading, failure }, copy)
}
