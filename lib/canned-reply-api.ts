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
 * Reading is open to any staff member, and so is writing a personal response
 * (no `organizationId`). An organization response needs `manage_canned_replies`,
 * and promoting a personal one is an Admin's; a refusal arrives as `refused`
 * rather than a screen pretending it worked. Nothing here sends a message: a
 * saved response is text, and what an Agent does with it is still a send
 * through the composer.
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
  params: { organizationId?: string; includeArchived?: boolean; personalOnly?: boolean } = {},
): Promise<ApiResult<CannedReply[]>> {
  const path = `/canned-replies${query({
    organizationId: params.organizationId,
    // The API honours only the literal `true`, so false is an absent key.
    includeArchived: params.includeArchived ? 'true' : undefined,
    personalOnly: params.personalOnly ? 'true' : undefined,
  })}`
  return readOutcome(await authenticatedRequest(path), parseCannedReplies)
}

/**
 * The composer's library: the thread's organization responses and the viewer's
 * own personal ones, or only the personal ones where the thread has no
 * organization (General Support, a staff DM) -- leaving the organization off
 * would otherwise widen the list to every organization's.
 */
export function listPickerCannedReplies(
  organizationId: string | null,
): Promise<ApiResult<CannedReply[]>> {
  return organizationId
    ? listCannedReplies({ organizationId })
    : listCannedReplies({ personalOnly: true })
}

/** With `organizationId`, the organization's; without, the caller's own personal response. */
export async function createCannedReply(input: {
  organizationId?: string | null
  title: string
  body: string
}): Promise<ApiResult<CannedReply>> {
  const outcome = await authenticatedRequest('/canned-replies', {
    method: 'POST',
    body: {
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      title: input.title,
      body: input.body,
    },
  })
  return readOutcome(outcome, parseCannedReply)
}

/** Admin only: a personal response becomes an organization's, same id and use count. */
export async function promoteCannedReply(
  id: string,
  organizationId: string,
): Promise<ApiResult<CannedReply>> {
  const outcome = await authenticatedRequest(
    `/canned-replies/${encodeURIComponent(id)}/promote`,
    { method: 'POST', body: { organizationId } },
  )
  return readOutcome(outcome, parseCannedReply)
}

/** Counts one use: the response was just put into the composer. */
export async function recordCannedReplyUse(id: string): Promise<ApiResult<CannedReply>> {
  const outcome = await authenticatedRequest(`/canned-replies/${encodeURIComponent(id)}/use`, {
    method: 'POST',
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
