import { colors } from '@/lib/tokens'
import type { WallPost, WallPostKind } from '@/lib/types'

/**
 * What a Post says it is, and how long it has left.
 *
 * Pure, and table-tested beside `lib/wall-card`: a kind's label and a deadline's
 * wording are decisions, not renders, and neither needs a screen to demonstrate.
 *
 * Both arrived with the API's "a Post that says what it is" and neither was ever
 * read by this client — a promotion, a giveaway, company news, a paid placement
 * and somebody's remark all drew the identical card, with the Post's own
 * headline thrown away and an offer's deadline invisible. What is here is the
 * client half of that: the five labels, their colours, and the one question a
 * countdown has to answer.
 */

/** The label each kind carries, matching the web client's `Wall.kind` strings. */
const KIND_LABEL: Record<WallPostKind, string> = {
  promotion: 'Promotion',
  giveaway: 'Giveaway',
  news: 'News',
  // "Sponsored" rather than "Ad", as on web: it is what the placement is called
  // to a reader, and it is the word the Hub's old Offers strip used too.
  ad: 'Sponsored',
  community: 'Community',
}

/**
 * A kind's colour, as a token rather than a class.
 *
 * The web client has a `--kind-*` ramp; this app's palette has no such family,
 * so each kind borrows the semantic token that already means the same thing —
 * and `community` deliberately borrows nothing. It is the default and the open
 * case, the kind most Posts are, and a colour on every card is a colour on none.
 */
const KIND_COLOR: Record<WallPostKind, string> = {
  promotion: colors.primary,
  giveaway: colors.success,
  news: colors.inkSoft,
  ad: colors.amber,
  community: colors.muted,
}

export function wallKindLabel(kind: WallPostKind): string {
  return KIND_LABEL[kind]
}

export function wallKindColor(kind: WallPostKind): string {
  return KIND_COLOR[kind]
}

/**
 * Whether a Post's kind is worth naming on its card.
 *
 * `community` is not. It is the default, it is what every Post written before
 * kinds existed reads as, and labelling it would put a chip on the majority of a
 * Wall that tells a reader nothing — the four that are *not* somebody talking
 * are the ones worth marking.
 */
export function wallKindIsNamed(kind: WallPostKind): boolean {
  return kind !== 'community'
}

export type WallDeadline =
  | { state: 'none' }
  | { state: 'ended' }
  | { state: 'live'; label: string }

/**
 * How long an offer has left, in the words a card shows.
 *
 * Days and hours while there is more than a day, and hours:minutes under one —
 * deliberately no seconds, unlike the web client's ticking pill. A countdown
 * that reticks every second on a phone is a list item re-rendering once a second
 * inside a virtualised feed, and the Wall is scrolled with a thumb; the web can
 * afford it on a page that is not being flung.
 *
 * `now` is a parameter rather than read here, which is what makes this a table:
 * a deadline is a fact about two instants, and a function that read the clock
 * itself could only be tested by mocking one.
 */
export function wallDeadline(post: WallPost, now: number): WallDeadline {
  if (!post.endsAt) return { state: 'none' }

  const endsAt = new Date(post.endsAt).getTime()
  // An unparseable date is not a deadline. Saying "Ended" for one would be a
  // claim about an offer this client simply failed to read.
  if (!Number.isFinite(endsAt)) return { state: 'none' }

  const remaining = endsAt - now
  if (remaining <= 0) return { state: 'ended' }

  const seconds = Math.floor(remaining / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return {
    state: 'live',
    label:
      days > 0
        ? `${days}d ${hours}h left`
        : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} left`,
  }
}
