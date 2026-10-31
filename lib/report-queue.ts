import type { AdminReport, ReportAction, ReportStatus, ReportSummary } from '@/lib/report-parse'
import type { ReportTargetKind } from '@/lib/report-reasons'

/**
 * The rules the Admin's report queue draws by.
 *
 * App Review expects a report to be acted on within a day, so the one thing
 * this module exists to get right is *overdue*: an open report older than
 * `REPORT_RESPONSE_HOURS` is said to be one in words, not only in colour, and
 * the Hub row says how many there are before anybody opens the queue.
 */

export const REPORT_RESPONSE_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

export function isReportOverdue(report: Pick<AdminReport, 'status' | 'createdAt'>, now: number): boolean {
  if (report.status !== 'open') return false
  const created = Date.parse(report.createdAt)
  return Number.isFinite(created) && now - created >= REPORT_RESPONSE_HOURS * HOUR_MS
}

/**
 * How long a report has waited, in the largest whole unit: `just now`, `12 min`,
 * `5 h`, `3 d`. Short because it sits beside the reason on one line.
 */
export function reportAge(createdAt: string, now: number): string {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return ''
  const minutes = Math.max(0, Math.floor((now - created) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.floor(hours / 24)} d`
}

export const REPORT_TABS: readonly { status: ReportStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'actioned', label: 'Actioned' },
  { status: 'dismissed', label: 'Dismissed' },
]

export const REPORT_TARGET_LABELS: Record<ReportTargetKind, string> = {
  wall_post: 'Wall post',
  message: 'Message',
  group: 'Group',
}

/** What each action's button says, and what its confirmation asks. */
export const REPORT_ACTION_COPY: Record<
  ReportAction,
  { label: string; title: string; body: string; confirm: string; destructive: boolean }
> = {
  remove_content: {
    label: 'Remove content',
    title: 'Remove this content?',
    body: 'It comes down for everyone. Every open report about it is closed as actioned.',
    confirm: 'Remove',
    destructive: true,
  },
  ban_user: {
    label: 'Ban user',
    title: 'Ban this person?',
    body: 'They are signed out everywhere and cannot sign in again until an admin lifts the ban.',
    confirm: 'Ban',
    destructive: true,
  },
  dismiss: {
    label: 'Dismiss',
    title: 'Dismiss this report?',
    body: 'Nothing is removed. The report moves to Dismissed.',
    confirm: 'Dismiss',
    destructive: false,
  },
}

export const REPORT_ACTION_DONE: Record<ReportAction, string> = {
  remove_content: 'Content removed',
  ban_user: 'User banned',
  dismiss: 'Dismissed',
}

/**
 * The Hub row's second line. Nothing waiting says so plainly; something
 * overdue leads with that, because it is the number somebody has to act on.
 */
export function reportSummaryLine(summary: ReportSummary | null): string {
  if (!summary) return 'Reported posts, messages and groups'
  if (summary.open === 0) return 'Nothing waiting for review'
  const open = `${summary.open} open`
  if (summary.overdue === 0) return open
  return `${summary.overdue} overdue · ${open}`
}

/** The queue after an action landed: a report that left its tab leaves the list. */
export function withResolvedReport(
  rows: AdminReport[],
  resolved: AdminReport,
  tab: ReportStatus,
): AdminReport[] {
  if (resolved.status !== tab) return rows.filter(row => row.id !== resolved.id)
  return rows.map(row => (row.id === resolved.id ? resolved : row))
}
