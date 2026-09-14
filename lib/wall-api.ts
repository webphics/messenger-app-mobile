import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseWallPosts } from '@/lib/wall-parse'
import type { WallPost } from '@/lib/types'

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
