import { query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseAnalyticsOverview } from '@/lib/analytics-parse'
import type { AnalyticsOverview } from '@/lib/types'

/**
 * The analytics endpoint the Admin Hub's charts are drawn from.
 *
 * Needs `view_team_analytics` server-side, so a call without it comes back
 * `refused` rather than as an empty overview — which is what lets a screen tell
 * the two apart. Nothing in this app asks for it outside the Admin Hub, and
 * `useAnalytics` does not ask at all for a viewer who does not hold it.
 *
 * `GET /analytics/live` is deliberately not here. It answers the queue's depth
 * right now, and the Hub already has those numbers without a request: the
 * Unassigned and Conversations tiles count the conversation list this device is
 * holding anyway (`components/hub/admin-hub`). A second read of the same fact on
 * its own clock would be a request to disagree with the tile above it. The
 * Awaiting reply tile is the exception and reads this overview's snapshot, since
 * whose message came last is the API's to count, not the list's.
 */

/**
 * The overview for a range, or for the API's own default when none is given.
 *
 * `from`/`to` are whole UTC days server-side and the response echoes the range
 * it actually used, so a caller that sends neither — which is every caller in
 * this app today — still knows what it is showing.
 */
export async function getAnalyticsOverview(
  params: { from?: string; to?: string } = {},
): Promise<ApiResult<AnalyticsOverview>> {
  const outcome = await authenticatedRequest(
    `/analytics/overview${query({ from: params.from, to: params.to })}`,
  )
  return readOutcome(outcome, parseAnalyticsOverview)
}
