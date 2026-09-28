import { query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseActivityPage } from '@/lib/activity-parse'
import type { ActivityPage } from '@/lib/types'

/**
 * The team's Activity feed.
 *
 * `GET /activity` needs `view_team_activity` server-side, and a caller without
 * it is answered `403` — which arrives as `refused` and lets the screen say so
 * rather than showing an empty feed. The only way into it on this client is the
 * Admin Hub row, which is drawn from the same capability.
 *
 * Read-only: the feed is written by the API as things happen and nothing here
 * writes to it.
 */

export type ActivityFilter = {
  /** Matched by the API against people's names, kinds and ids. */
  search?: string
  page?: number
  pageSize?: number
}

/** One page, newest first — `at` is the only order the API offers. */
export async function listActivity(filter: ActivityFilter = {}): Promise<ApiResult<ActivityPage>> {
  const search = filter.search?.trim()
  const path = `/activity${query({
    page: filter.page ?? 1,
    pageSize: filter.pageSize ?? 30,
    sort: 'at',
    dir: 'desc',
    search: search === '' ? undefined : search,
  })}`
  return readOutcome(await authenticatedRequest(path), parseActivityPage)
}
