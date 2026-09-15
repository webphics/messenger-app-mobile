import type { ApiFailure } from '@/lib/api-result'
import type { UserRole, WallPost, WallPostReaction } from '@/lib/types'

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

/** Who is looking, which is all any of this needs beyond the Post itself. */
export type WallPostViewer = { id: string; role: UserRole }

/** The API's own ceiling on a Post's body (`WALL_POST_BODY_MAX`), mirrored so an edit can say so before the API does. */
export const WALL_POST_BODY_MAX = 500

export type WallPostAction = 'copy-body' | 'copy-link' | 'edit' | 'delete' | 'takedown'

/**
 * What the overflow control offers.
 *
 * `edit` and `delete` are the author's, and only the author's — mirrors
 * `WallPolicy.assertCanEdit`, which has no Admin exception. `takedown` is the
 * one place a role exception applies to a Post's write path
 * (`assertCanRemove`): an Admin acting on somebody *else's* Post. An Admin's
 * own Post still reads as `delete` — a takedown is what happens to somebody
 * else's writing, never to your own.
 */
export function wallPostActions(post: WallPost, viewer: WallPostViewer): WallPostAction[] {
  const isAuthor = post.author.id === viewer.id
  const isAdmin = viewer.role === 'admin'

  return [
    post.body?.trim() ? ('copy-body' as const) : null,
    post.link ? ('copy-link' as const) : null,
    isAuthor ? ('edit' as const) : null,
    isAuthor ? ('delete' as const) : null,
    isAdmin && !isAuthor ? ('takedown' as const) : null,
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
