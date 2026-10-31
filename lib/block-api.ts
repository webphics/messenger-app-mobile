import { readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseBlockedPeople,
  parseBlockedPerson,
  parseUnblocked,
  type BlockedPerson,
} from '@/lib/blocked-people'

/** Blocking, over the one transport this app has (`docs/api/blocks.md` in messenger-api). */

export async function listBlockedPeople(): Promise<ApiResult<BlockedPerson[]>> {
  return readOutcome(await authenticatedRequest('/blocks'), parseBlockedPeople)
}

/** Idempotent on the API's side: blocking somebody already blocked answers the same row. */
export async function blockPerson(userId: string): Promise<ApiResult<BlockedPerson>> {
  return readOutcome(
    await authenticatedRequest('/blocks', { method: 'POST', body: { userId } }),
    parseBlockedPerson,
  )
}

export async function unblockPerson(userId: string): Promise<ApiResult<{ userId: string }>> {
  return readOutcome(
    await authenticatedRequest(`/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    parseUnblocked,
  )
}
