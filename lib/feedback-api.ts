import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseAdminFeedback,
  parseAdminFeedbackPage,
  parseFeedbackReceipt,
  parseFeedbackSummary,
  type AdminFeedback,
  type AdminFeedbackPage,
  type FeedbackKind,
  type FeedbackReceipt,
  type FeedbackSummary,
} from '@/lib/feedback-parse'
import type { FeedbackTab, TriageUpdate } from '@/lib/feedback-rules'

/**
 * Bug reports and Feedback, over the one transport this app has
 * (`modules/feedback` in messenger-api). Filing is anybody's and is all a
 * reporter can do; reading and triage are the super admin's, and the API
 * refuses everybody else whatever this client draws.
 */

/** The multipart field `FilesInterceptor('attachments', …)` reads on the API. */
const ATTACHMENTS_FIELD = 'attachments'

/**
 * File one entry. `fields` is `feedbackFields`' answer.
 *
 * With a file it goes as one multipart body, the fields beside the file,
 * streamed by the native uploader (ADR-0007). Without one it goes as JSON: the
 * API's multer interceptor passes a body that is not multipart straight
 * through, and every value is already the string a multipart body would carry.
 */
export async function createFeedback(
  fields: Record<string, string>,
  attachment: { uri: string; type: string } | null,
): Promise<ApiResult<FeedbackReceipt>> {
  const outcome = attachment
    ? await authenticatedRequest('/feedback', {
        method: 'POST',
        file: { uri: attachment.uri, type: attachment.type, field: ATTACHMENTS_FIELD, fields },
      })
    : await authenticatedRequest('/feedback', { method: 'POST', body: fields })
  return readOutcome(outcome, parseFeedbackReceipt)
}

export async function listFeedback(options: {
  state: FeedbackTab
  kind?: FeedbackKind
  page?: number
  pageSize?: number
}): Promise<ApiResult<AdminFeedbackPage>> {
  const path = `/feedback${query({
    state: options.state,
    kind: options.kind,
    page: options.page,
    pageSize: options.pageSize,
  })}`
  return readOutcome(await authenticatedRequest(path), parseAdminFeedbackPage)
}

export async function readFeedback(id: string): Promise<ApiResult<AdminFeedback>> {
  return readOutcome(
    await authenticatedRequest(`/feedback/${encodeURIComponent(id)}`),
    parseAdminFeedback,
  )
}

export async function readFeedbackSummary(): Promise<ApiResult<FeedbackSummary>> {
  return readOutcome(await authenticatedRequest('/feedback/summary'), parseFeedbackSummary)
}

export async function updateFeedback(
  id: string,
  update: TriageUpdate,
): Promise<ApiResult<AdminFeedback>> {
  const outcome = await authenticatedRequest(`/feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: update,
  })
  return readOutcome(outcome, parseAdminFeedback)
}
