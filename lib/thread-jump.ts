import type { ThreadRow } from '@/lib/thread-rows'

/**
 * What a tap on a reply's quote does next, one step at a time.
 *
 * The original may be anywhere: on screen, in the rows the list holds but has
 * not drawn, or further back than anything this device has loaded. Pure, so
 * the walk back through history is a table rather than a guess.
 */
export type JumpStep =
  /** It is a row: scroll there. */
  | { kind: 'scroll'; index: number }
  /** Not yet loaded: ask for the page before the oldest one held. */
  | { kind: 'load' }
  /** A page is already on its way; its arrival will ask again. */
  | { kind: 'wait' }
  /** Nothing more to look through: deleted, or past what anyone may read. */
  | { kind: 'give-up' }

/**
 * How many pages a jump will walk back before saying it could not find the
 * original. Each is one request; past this the reply is to something old enough
 * that a person would rather be told than watch the thread scroll for a while.
 */
export const JUMP_MAX_PAGES = 8

export function jumpStep(
  rows: readonly ThreadRow[],
  targetId: string,
  { pagesLoaded, loadingOlder, canLoadOlder }: {
    pagesLoaded: number
    loadingOlder: boolean
    canLoadOlder: boolean
  },
): JumpStep {
  const index = rows.findIndex((row) => row.type === 'message' && row.id === targetId)
  if (index !== -1) return { kind: 'scroll', index }
  if (loadingOlder) return { kind: 'wait' }
  if (!canLoadOlder || pagesLoaded >= JUMP_MAX_PAGES) return { kind: 'give-up' }
  return { kind: 'load' }
}
