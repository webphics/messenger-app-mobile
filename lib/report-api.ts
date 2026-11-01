import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseAdminReport,
  parseAdminReportPage,
  parseReportReceipt,
  parseReportSummary,
  type AdminReport,
  type AdminReportPage,
  type ReportAction,
  type ReportReceipt,
  type ReportStatus,
  type ReportSummary,
} from '@/lib/report-parse'
import type { ReportReason, ReportTargetKind } from '@/lib/report-reasons'

/**
 * Reports, over the one transport this app has (`docs/api/reports.md` in
 * messenger-api). Filing is anybody's; the queue and its actions are an
 * Admin's, and the API refuses everybody else whatever this client draws.
 */

export type ReportInput = {
  targetKind: ReportTargetKind
  targetId: string
  /** Required by the API for a Message, which is only addressable inside its conversation. */
  conversationId?: string
  reason: ReportReason
  details?: string
}

export async function createReport(input: ReportInput): Promise<ApiResult<ReportReceipt>> {
  const body: Record<string, string> = {
    targetKind: input.targetKind,
    targetId: input.targetId,
    reason: input.reason,
  }
  if (input.conversationId) body.conversationId = input.conversationId
  if (input.details) body.details = input.details

  return readOutcome(await authenticatedRequest('/reports', { method: 'POST', body }), parseReportReceipt)
}

export async function listReports(
  options: { status?: ReportStatus; page?: number; pageSize?: number } = {},
): Promise<ApiResult<AdminReportPage>> {
  const path = `/reports${query({
    status: options.status,
    page: options.page,
    pageSize: options.pageSize,
  })}`
  return readOutcome(await authenticatedRequest(path), parseAdminReportPage)
}

export async function readReportSummary(): Promise<ApiResult<ReportSummary>> {
  return readOutcome(await authenticatedRequest('/reports/summary'), parseReportSummary)
}

export async function resolveReport(
  reportId: string,
  action: ReportAction,
  note?: string,
): Promise<ApiResult<AdminReport>> {
  const body: Record<string, string> = { action }
  const trimmed = note?.trim()
  if (trimmed) body.note = trimmed
  const outcome = await authenticatedRequest(
    `/reports/${encodeURIComponent(reportId)}/resolve`,
    { method: 'POST', body },
  )
  return readOutcome(outcome, parseAdminReport)
}
