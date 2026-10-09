import { readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseCommunity } from '@/lib/community-parse'
import type { Community } from '@/lib/types'

/**
 * The Community writes an Admin's phone makes: creating one, and editing its
 * name and description. Creating needs `create_communities`; editing needs that
 * or being the Community's Moderator. The API refuses otherwise. Linking Groups,
 * promoting Moderators and answering join requests stay on web.
 */

export async function createCommunity(input: {
  name: string
  description: string | null
  organizationId: string
  memberIds: string[]
}): Promise<ApiResult<Community>> {
  const outcome = await authenticatedRequest('/communities', {
    method: 'POST',
    // `.strict()`: an empty description is left out rather than sent blank.
    body: {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      organizationId: input.organizationId,
      memberIds: input.memberIds,
    },
  })
  return readOutcome(outcome, parseCommunity)
}

/** `description: null` clears it. At least one field must be sent. */
export async function updateCommunity(
  id: string,
  changes: { name?: string; description?: string | null },
): Promise<ApiResult<Community>> {
  const outcome = await authenticatedRequest(`/communities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.description === undefined ? {} : { description: changes.description }),
    },
  })
  return readOutcome(outcome, parseCommunity)
}
