import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseJoinLink,
  parseJoinLinks,
  parseRevoked,
  type JoinLink,
  type JoinLinkExpiryHours,
  type JoinLinkUsageMode,
} from '@/lib/join-links'

/**
 * The organization join link endpoints, an Admin's side.
 *
 * All three are gated server-side on `manage_organizations`, and creating or
 * revoking also on every named organization being in the actor's scope; the
 * screen's guard is only the courtesy of not opening for somebody who would be
 * refused. There is no delete: a revoked link stays listed, as it does on web.
 */

/** Every link, newest first. A hundred is more than anybody keeps live at once. */
export async function listJoinLinks(): Promise<ApiResult<JoinLink[]>> {
  const path = `/organization-join-links${query({
    page: 1,
    pageSize: 100,
    sort: 'createdAt',
    dir: 'desc',
  })}`
  return readOutcome(await authenticatedRequest(path), parseJoinLinks)
}

export async function createJoinLink(input: {
  organizationIds: string[]
  usageMode: JoinLinkUsageMode
  expiresInHours: JoinLinkExpiryHours
}): Promise<ApiResult<JoinLink>> {
  const outcome = await authenticatedRequest('/organization-join-links', {
    method: 'POST',
    body: input,
  })
  return readOutcome(outcome, parseJoinLink)
}

/** `false` means it was already dead; the list is re-read either way. */
export async function revokeJoinLink(id: string): Promise<ApiResult<boolean>> {
  const path = `/organization-join-links/${encodeURIComponent(id)}/revoke`
  return readOutcome(await authenticatedRequest(path, { method: 'POST' }), parseRevoked)
}
