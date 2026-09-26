import { query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseCannedReplies,
  parseCannedReply,
  parseCannedReplyDeleted,
} from '@/lib/canned-reply-parse'
import type { CannedReply } from '@/lib/types'

/**
 * The saved-response endpoints (`/canned-replies`).
 *
 * Reading is open to any staff member; the three writes are
 * `@Roles(['admin'])`, so an Agent reaching one gets `refused` rather than a
 * screen pretending it worked. Nothing here sends a message: a saved response
 * is text, and what an Agent does with it is still a send through the composer.
 */

/**
 * The library.
 *
 * The admin screen asks for archived rows too and hides them itself, because its
 * empty state has to tell an empty library from one whose every response is
 * archived. The composer's picker never asks: an archived response is one an
 * Agent must not be offered. `organizationId` omitted spans every organization
 * the viewer may reach.
 */
export async function listCannedReplies(
  params: { organizationId?: string; includeArchived?: boolean } = {},
): Promise<ApiResult<CannedReply[]>> {
  const path = `/canned-replies${query({
    organizationId: params.organizationId,
    // The API honours only the literal `true`, so false is an absent key.
    includeArchived: params.includeArchived ? 'true' : undefined,
  })}`
  return readOutcome(await authenticatedRequest(path), parseCannedReplies)
}

export async function createCannedReply(input: {
  organizationId: string
  title: string
  body: string
}): Promise<ApiResult<CannedReply>> {
  const outcome = await authenticatedRequest('/canned-replies', {
    method: 'POST',
    body: input,
  })
  return readOutcome(outcome, parseCannedReply)
}

export async function updateCannedReply(
  id: string,
  changes: { title?: string; body?: string; archived?: boolean },
): Promise<ApiResult<CannedReply>> {
  const outcome = await authenticatedRequest(`/canned-replies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    // `.strict()` and "at least one", so each absent key is a field left alone.
    body: {
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.body === undefined ? {} : { body: changes.body }),
      ...(changes.archived === undefined ? {} : { archived: changes.archived }),
    },
  })
  return readOutcome(outcome, parseCannedReply)
}

/** Permanent on the API side. The screen confirms first and points at archiving. */
export async function deleteCannedReply(id: string): Promise<ApiResult<boolean>> {
  const outcome = await authenticatedRequest(`/canned-replies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, parseCannedReplyDeleted)
}
