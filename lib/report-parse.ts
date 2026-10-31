import { asRecord } from '@/lib/api-envelope'
import { REPORT_REASONS, type ReportReason, type ReportTargetKind } from '@/lib/report-reasons'

/**
 * Reading the API's report payloads (`docs/api/reports.md` in messenger-api).
 *
 * The rules are `lib/wall-parse`'s: null for a payload this client cannot
 * read, and a list drops the rows it cannot read rather than failing the page —
 * one unreadable report must not hide every other one from the person whose
 * job is to answer them within the day.
 */

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_ACTIONS = ['remove_content', 'ban_user', 'dismiss'] as const
export type ReportAction = (typeof REPORT_ACTIONS)[number]

const TARGET_KINDS: readonly ReportTargetKind[] = ['wall_post', 'message', 'group']

/** What the person reporting gets back: the receipt, never the review. */
export type ReportReceipt = {
  id: string
  reference: string
  status: ReportStatus
  createdAt: string
}

export type ReportPerson = {
  id: string
  name: string
  email: string | null
  image: string | null
  role: string | null
}

/** One report as an Admin reviews it. */
export type AdminReport = {
  id: string
  reference: string
  targetKind: ReportTargetKind
  targetId: string
  conversationId: string | null
  reason: ReportReason
  details: string | null
  status: ReportStatus
  action: ReportAction | null
  resolutionNote: string | null
  content: { text: string | null; attachmentCount: number; removed: boolean }
  /**
   * When the content was taken down and when its author was banned, each from
   * any report on the same target. Kept apart from `action`, which is only the
   * latest decision, so a removal followed by a ban still shows both.
   */
  contentRemovedAt: string | null
  userBannedAt: string | null
  reporter: ReportPerson | null
  reportedUser: ReportPerson | null
  handledBy: ReportPerson | null
  availableActions: ReportAction[]
  createdAt: string
  resolvedAt: string | null
}

export type AdminReportPage = {
  rows: AdminReport[]
  total: number
  page: number
  pageSize: number
}

export type ReportSummary = {
  open: number
  overdue: number
  oldestOpenAt: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function parseReportReceipt(data: unknown): ReportReceipt | null {
  const row = asRecord(data)
  if (!row) return null
  const id = text(row.id)
  const createdAt = text(row.createdAt)
  if (!id || !createdAt) return null
  return {
    id,
    reference: text(row.reference) ?? '',
    status: oneOf(row.status, REPORT_STATUSES) ?? 'open',
    createdAt,
  }
}

function parsePerson(data: unknown): ReportPerson | null {
  const row = asRecord(data)
  if (!row) return null
  const id = text(row.id)
  const name = text(row.name)
  if (!id || !name) return null
  return {
    id,
    name,
    email: text(row.email),
    image: text(row.image),
    role: text(row.role),
  }
}

/**
 * A report, or null for one missing what a reviewer needs to act on it: what
 * it is about, why, and when it was made. An action this build does not know is
 * dropped rather than drawn as a button that sends something the API never
 * offered.
 */
export function parseAdminReport(data: unknown): AdminReport | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const targetKind = oneOf(row.targetKind, TARGET_KINDS)
  const targetId = text(row.targetId)
  const reason = oneOf(row.reason, REPORT_REASONS)
  const status = oneOf(row.status, REPORT_STATUSES)
  const createdAt = text(row.createdAt)
  if (!id || !targetKind || !targetId || !reason || !status || !createdAt) return null

  const content = asRecord(row.content)
  const actions = Array.isArray(row.availableActions) ? row.availableActions : []

  return {
    id,
    reference: text(row.reference) ?? '',
    targetKind,
    targetId,
    conversationId: text(row.conversationId),
    reason,
    details: text(row.details),
    status,
    action: oneOf(row.action, REPORT_ACTIONS),
    resolutionNote: text(row.resolutionNote),
    content: {
      text: text(content?.text),
      attachmentCount: count(content?.attachmentCount),
      removed: content?.removed === true || text(row.contentRemovedAt) !== null,
    },
    contentRemovedAt: text(row.contentRemovedAt),
    userBannedAt: text(row.userBannedAt),
    reporter: parsePerson(row.reporter),
    reportedUser: parsePerson(row.reportedUser),
    handledBy: parsePerson(row.handledBy),
    availableActions: actions
      .map(action => oneOf(action, REPORT_ACTIONS))
      .filter((action): action is ReportAction => action !== null),
    createdAt,
    resolvedAt: text(row.resolvedAt),
  }
}

export function parseAdminReportPage(data: unknown): AdminReportPage | null {
  const page = asRecord(data)
  if (!page || !Array.isArray(page.rows)) return null
  const rows = page.rows
    .map(parseAdminReport)
    .filter((report): report is AdminReport => report !== null)
  return {
    rows,
    total: count(page.total),
    page: count(page.page) || 1,
    pageSize: count(page.pageSize) || rows.length,
  }
}

export function parseReportSummary(data: unknown): ReportSummary | null {
  const row = asRecord(data)
  if (!row) return null
  return { open: count(row.open), overdue: count(row.overdue), oldestOpenAt: text(row.oldestOpenAt) }
}
