import type { ApiFailure } from '@/lib/api-result'
import { can, type Capability } from '@/lib/capabilities'
import type { UserRole, WallPost, WallPostReaction, WallVoteDirection } from '@/lib/types'

/**
 * Everything a person can do to a Post, once it is already on the Wall.
 *
 * Reacting needs no gate — any reader may — but the overflow control does:
 * what it offers is a table over the same two facts the API's own
 * `WallPolicy` checks (`assertCanEdit`, `assertCanRemove`), so nothing here
 * opens onto a refusal. The property worth keeping is that the list can be
 * *empty*: a Post with nothing to offer must draw no control at all, which is
 * why this stays a list rather than a set of conditions inside a sheet.
 */

/**
 * Who is looking, which is all any of this needs beyond the Post itself.
 * `capabilities` is the session's effective set (root ADR 0017).
 */
export type WallPostViewer = {
  id: string
  role: UserRole
  capabilities: readonly Capability[]
}

/** The API's own ceiling on a Post's body (`WALL_POST_BODY_MAX`), mirrored so an edit can say so before the API does. */
export const WALL_POST_BODY_MAX = 500

export type WallPostAction =
  | 'copy-body'
  | 'copy-link'
  | 'edit'
  | 'delete'
  | 'takedown'
  | 'report'
  | 'block'

/**
 * What the overflow control offers.
 *
 * `edit` and `delete` are the author's, and only the author's — mirrors
 * `WallPolicy.assertCanEdit`, which has no Admin exception. `takedown` needs
 * `remove_wall_posts` (`assertCanRemove`), whatever the role: a holder acting
 * on somebody *else's* Post. A holder's own Post still reads as `delete`. A
 * takedown is what happens to somebody else's writing, never to your own.
 *
 * `report` and `block` are every reader's on every Post but their own, whatever
 * the role: App Review asks that anybody can report what they see and block
 * whoever posted it, and the API's `POST /reports` and `POST /blocks` refuse
 * only yourself. They come last because they are the ones that leave the card.
 */
export function wallPostActions(post: WallPost, viewer: WallPostViewer): WallPostAction[] {
  const isAuthor = post.author.id === viewer.id
  const mayTakeDown = can(viewer, 'remove_wall_posts')

  return [
    post.body?.trim() ? ('copy-body' as const) : null,
    post.link ? ('copy-link' as const) : null,
    isAuthor ? ('edit' as const) : null,
    isAuthor ? ('delete' as const) : null,
    mayTakeDown && !isAuthor ? ('takedown' as const) : null,
    isAuthor ? null : ('report' as const),
    isAuthor ? null : ('block' as const),
  ].filter((action): action is WallPostAction => action !== null)
}

/**
 * The quick picker a reader reacts from.
 *
 * Named apart from `REACT_EMOJIS` (`lib/message-react`) rather than sharing
 * it: a Message and a Post are reacted to through different rules — one
 * reaction per person per Message, any number per person on a Post — so the
 * two lists are free to drift rather than accidentally coupled by reuse.
 */
export const WALL_REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const

/**
 * What a tap on one exact emoji does to a Post's reactions.
 *
 * Not `toggleReaction`'s rule: a Message holds one reaction per person, so a
 * second emoji replaces the first, but the API's `POST /wall/posts/:id/reactions`
 * is a toggle over one emoji at a time and a reader may hold several on the
 * same Post at once (👍 and 🔥 from the same person coexist). So this only
 * ever adds or removes the exact `{ emoji, userId }` pair the tap named,
 * leaving whatever else that person reacted with untouched.
 *
 * `added` is read by the caller to know which of the API's two outcomes to
 * ask for — never assumed from the tap, so a race with another device's own
 * toggle cannot be answered by this device's stale guess.
 */
export function toggleWallPostReaction(
  reactions: WallPostReaction[],
  emoji: string,
  userId: string,
): { reactions: WallPostReaction[]; added: boolean } {
  const hasSame = reactions.some((reaction) => reaction.userId === userId && reaction.emoji === emoji)

  return {
    reactions: hasSame
      ? reactions.filter((reaction) => !(reaction.userId === userId && reaction.emoji === emoji))
      : [...reactions, { emoji, userId }],
    added: !hasSame,
  }
}

/**
 * The direction a tap on `direction` leaves the caller holding, given what they
 * held before — mirrors `POST /wall/posts/:id/vote`'s own toggle: casting the
 * direction already held clears it, the opposite direction replaces it. A
 * caller never holds an up and a down at once.
 */
export function nextWallPostVote(
  previousVote: WallVoteDirection | null,
  direction: WallVoteDirection,
): WallVoteDirection | null {
  return previousVote === direction ? null : direction
}

/** `1` for an upvote, `-1` for a downvote, `0` for none — the arithmetic `score` and `upvoteCount` move by. */
function voteValue(direction: WallVoteDirection | null): number {
  if (direction === 'up') return 1
  if (direction === 'down') return -1
  return 0
}

/**
 * Applies the same vote math the API applies server-side: `score` and
 * `upvoteCount` move by the difference between what this caller held before
 * and what they hold after. Symmetric in `previousVote`/`nextVote`, so the same
 * function applies a vote optimistically and rolls one back — a rollback is
 * just a call with the two arguments swapped.
 *
 * There is deliberately no way to derive a downvote count from this: `score`
 * already carries it, and the API never offers one publicly either way.
 */
export function withVoteDelta(
  post: WallPost,
  previousVote: WallVoteDirection | null,
  nextVote: WallVoteDirection | null,
): WallPost {
  return {
    ...post,
    score: post.score - voteValue(previousVote) + voteValue(nextVote),
    upvoteCount: post.upvoteCount - (previousVote === 'up' ? 1 : 0) + (nextVote === 'up' ? 1 : 0),
  }
}

/**
 * A tap on the bookmark control, everywhere it flips a Post in place rather
 * than removing its row — the default Wall, a named one, and a Post's own
 * reactions all draw the same card and the same control.
 *
 * Nothing to reconcile the way a reaction's array does: a bookmark is one
 * boolean per person per Post, so the optimistic patch is simply its
 * opposite, and putting it back on a refusal is the same call again. Not the
 * Saved view's own toggle (`lib/use-wall-bookmarks`) — there, the Post's
 * presence in the list *is* the bookmark, and a tap removes the row instead
 * of flipping a flag on it.
 */
export function flipWallPostBookmark(post: WallPost): WallPost {
  return { ...post, isBookmarked: !post.isBookmarked }
}

/**
 * Whether Reply is offered on a Post at all (#77).
 *
 * "The viewer's own support conversation" is a Customer's concept — staff has
 * no such thread — so this is the one control on a Post gated by role rather
 * than by authorship, and it is gated the same way for every Post regardless
 * of who wrote it or which organization it belongs to.
 */
export function canReplyToWallPost(viewer: WallPostViewer): boolean {
  return viewer.role === 'customer'
}

/**
 * One sentence for an edit or a removal the API refused, or nothing.
 *
 * An expired session says nothing here, the convention every write in this app
 * follows: the auth layer is already on its way to sign-in, and a sentence
 * about a Post would arrive on a screen that is leaving.
 */
export function wallActionRefusal(failure: ApiFailure): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return 'That could not be saved.'
}
