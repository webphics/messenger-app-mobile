import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseWallPost, parseWallPostRemoval, parseWallPosts } from '@/lib/wall-parse'
import type { WallPost, WallPostLink } from '@/lib/types'

/**
 * The Wall endpoints, over the one transport this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds paths, not a second way of talking to the API.
 */

/**
 * The most Posts one page may hold. The API refuses anything above a hundred
 * and defaults to fifty; this names the number rather than letting the default
 * decide, because `applyFirstPage` reads a short page as the end of the Wall
 * and has to be comparing against the number that was actually asked for.
 */
export const WALL_PAGE_LIMIT = 20

/**
 * A page of the default Wall, newest first.
 *
 * No `wall` parameter: absent is the default Wall, which the API resolves at
 * read time to every organization the reader belongs to. There is no value that
 * asks for a wider set than one's own memberships, so a Customer, an Agent and
 * an Admin all read this same path and each receives their own.
 *
 * `cursor` is the id of the last Post on the previous page, never an offset.
 */
export async function listWallPosts(
  params: { cursor?: string; limit?: number } = {},
): Promise<ApiResult<WallPost[]>> {
  const outcome = await authenticatedRequest(
    `/wall/posts${query({ cursor: params.cursor, limit: params.limit ?? WALL_PAGE_LIMIT })}`,
  )
  return readOutcome(outcome, parseWallPosts)
}

/**
 * Toggles the caller's own reaction with one exact emoji on a Post.
 *
 * One route, not an add/remove pair — the API decides on/off from whatever
 * this caller already holds and answers with the Post as it now stands, which
 * is how "whether a tap resolved to an add or a remove is read off the
 * answer" is satisfied rather than assumed here. The caller (`lib/use-wall`)
 * works out what to draw optimistically; this only carries the request.
 *
 * Named apart from `toggleWallPostReaction` (`lib/wall-actions`, the pure
 * reducer over the optimistic patch) rather than sharing it: one sends a
 * request, the other decides what a tap means, and a shared name would read
 * as though this function decided anything.
 */
export async function reactToWallPost(
  postId: string,
  emoji: string,
): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(
    `/wall/posts/${encodeURIComponent(postId)}/reactions`,
    { method: 'POST', body: { emoji } },
  )
  return readOutcome(outcome, parseWallPost)
}

/**
 * What an edit on this device may change: the body, and the link button.
 *
 * Deliberately not `attachments` — there is no picker wired into an edit yet,
 * so this app never sends the field at all, and the API leaves a Post's
 * attachments exactly as they were on any request that omits it
 * (`UpdateWallPostSchema`). `link: null` removes the link button; `link`
 * simply absent leaves it as it is, the same rule the API's own schema uses.
 */
export type WallPostEditInput = {
  body?: string
  link?: WallPostLink | null
}

/**
 * The author's own edit. No Admin exception on the API side
 * (`WallPolicy.assertCanEdit`), so a refusal here always means this caller is
 * not the author — `lib/wall-actions` is what keeps the control from being
 * offered to begin with.
 */
export async function updateWallPost(
  postId: string,
  input: WallPostEditInput,
): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: input,
  })
  return readOutcome(outcome, parseWallPost)
}

/**
 * The author taking down their own Post, or an Admin taking down anyone's.
 * Soft on the API's side — the document survives for the record — so the
 * answer is only the id, never a Post this Wall will show again.
 */
export async function removeWallPost(postId: string): Promise<ApiResult<{ id: string }>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, parseWallPostRemoval)
}
