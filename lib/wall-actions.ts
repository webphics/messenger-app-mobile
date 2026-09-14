import type { WallPost } from '@/lib/types'

/**
 * What the control at the top of a Post's card offers.
 *
 * A list rather than a set of conditions inside a sheet, because the interesting
 * property is that it can be *empty*: a Post with nothing to offer must draw no
 * control at all. A control that opens an empty sheet is a dead end, and the
 * half of this feature that acts on a Post — editing one's own, deleting it, an
 * Admin taking somebody else's down — arrives with its own ticket. Until then
 * the only things a reader can do to a Post are the two that need no server.
 *
 * Kept pure and out of the sheet so the rule is a table: what a Post with a body
 * offers, what one with only a picture offers, and what a Post with both
 * offers.
 */
export type WallPostAction = 'copy-body' | 'copy-link'

export function wallPostActions(post: WallPost): WallPostAction[] {
  return [
    post.body?.trim() ? ('copy-body' as const) : null,
    post.link ? ('copy-link' as const) : null,
  ].filter((action): action is WallPostAction => action !== null)
}
