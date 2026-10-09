import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseAcknowledgementReport,
  parseBroadcast,
  parseBroadcasts,
} from '@/lib/broadcast-parse'
import type { Broadcast, BroadcastAcknowledgementReport, BroadcastAudience } from '@/lib/types'

/**
 * The Broadcast endpoints an Admin's phone uses: the sent history, sending one,
 * and who has acknowledged one that asked for it.
 *
 * Sending needs `send_broadcasts` and the report needs `view_acknowledgements`;
 * the API refuses either without it, and the screens only draw the controls for
 * a viewer who holds them.
 */

/** The page size the history asks for. The API caps a page at a hundred. */
export const BROADCAST_PAGE_SIZE = 30

/** The page size the acknowledgement report asks for. */
export const ACKNOWLEDGEMENT_PAGE_SIZE = 50

/**
 * One page of history, newest first. `cursor` is the id of the last row already
 * held; a page shorter than the page size is the last one.
 */
export async function listBroadcasts(
  params: { cursor?: string; limit?: number } = {},
): Promise<ApiResult<Broadcast[]>> {
  const path = `/broadcasts${query({
    cursor: params.cursor,
    limit: params.limit ?? BROADCAST_PAGE_SIZE,
  })}`
  return readOutcome(await authenticatedRequest(path), parseBroadcasts)
}

export async function createBroadcast(input: {
  title: string
  body: string
  essential: boolean
  requiresAcknowledgement: boolean
  audience: BroadcastAudience
}): Promise<ApiResult<Broadcast>> {
  const outcome = await authenticatedRequest('/broadcasts', { method: 'POST', body: input })
  return readOutcome(outcome, parseBroadcast)
}

export type AcknowledgementFilter = 'pending' | 'acknowledged' | 'all'

/** One page of a Broadcast's recipients, offset-paged over a list that was frozen when it was sent. */
export async function listAcknowledgements(
  broadcastId: string,
  params: { offset?: number; limit?: number; status?: AcknowledgementFilter } = {},
): Promise<ApiResult<BroadcastAcknowledgementReport>> {
  const path = `/broadcasts/${encodeURIComponent(broadcastId)}/acknowledgements${query({
    offset: params.offset ?? 0,
    limit: params.limit ?? ACKNOWLEDGEMENT_PAGE_SIZE,
    status: params.status ?? 'all',
  })}`
  return readOutcome(await authenticatedRequest(path), parseAcknowledgementReport)
}
