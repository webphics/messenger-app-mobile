import type { ApiFailure } from '@/lib/api-result'
import { failureNotice, readRefusal } from '@/lib/conversation-failure'

/**
 * What a list has to say about itself over and above the rows in it.
 *
 * Two screens read a paged list off the API — a thread's Messages and a Wall's
 * Posts — and both have to answer the same four-way question with the same
 * precedence. The copy differs, the inputs differ slightly, and the *order* is
 * the part that must not: a failure outranks a load, and rows outrank an empty
 * list. That order is what keeps a retry honest, because it clears the failure
 * and puts the list back into loading, so the notice it replaces is a spinner
 * rather than the same notice again until the answer arrives.
 *
 * The distinction worth keeping is between a list that has nothing to show and
 * one that could not find out: an empty conversation and an unreachable server
 * would otherwise render identically, and they mean opposite things.
 *
 * `stale` is the one that is not a placeholder. Rows are drawn, what is drawn
 * is still true, and a notice that replaced them would throw away the list to
 * report a request — so the failure sits beside them in one line and is
 * dismissed rather than retried.
 */
export type ReadNotice =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'empty'; title: string; hint: string }
  | { kind: 'failed'; title: string; hint: string }
  | { kind: 'stale'; message: string }

export type ReadNoticeInput = {
  /** Everything on screen, including rows the server has never seen. */
  drawn: number
  /**
   * How much of what is drawn came from the API.
   *
   * Separate from `drawn` because the two questions differ: whether the list
   * looks empty is about anything at all being there, and whether a failure can
   * be reduced to one line is about the server having answered at least once. A
   * thread whose only bubble is a Message that never got away has been read by
   * nobody, and a strip over it would report the failure in the corner of a
   * screen that has nothing else to say. A list with no unsent half — a Wall —
   * passes the same number twice.
   */
  confirmed: number
  /** The first page, only: paging back and pulling to refresh report themselves. */
  loading: boolean
  failure: ApiFailure | null
}

/** The sentences a particular list puts in the four outcomes above. */
export type ReadNoticeCopy = {
  /** Titles a refusal — the one failure that speaks in the API's own words. */
  refusedTitle: string
  emptyTitle: string
  emptyHint: string
}

export function readNotice(
  { drawn, confirmed, loading, failure }: ReadNoticeInput,
  copy: ReadNoticeCopy,
): ReadNotice {
  if (failure) {
    if (confirmed === 0) return { kind: 'failed', ...failureNotice(failure, copy.refusedTitle) }
    const message = readRefusal(failure)
    return message ? { kind: 'stale', message } : { kind: 'none' }
  }

  if (drawn > 0) return { kind: 'none' }
  if (loading) return { kind: 'loading' }

  return { kind: 'empty', title: copy.emptyTitle, hint: copy.emptyHint }
}
