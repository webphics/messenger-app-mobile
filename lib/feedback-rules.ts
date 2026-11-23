import { uploadMimeType } from '@/lib/attachment-upload'
import {
  BUG_REPORT_CATEGORIES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CLOSED_STATUSES,
  FEEDBACK_STATUSES,
  type AdminFeedback,
  type FeedbackCategory,
  type FeedbackKind,
  type FeedbackSeverity,
  type FeedbackStatus,
  type FeedbackSummary,
} from '@/lib/feedback-parse'
import type { AttachmentView } from '@/lib/types'

/**
 * The rules the feedback form and the super admin's triage draw by, mirroring
 * the web client's `features/feedback` and the API's `CreateFeedbackSchema`.
 *
 * Pure and free of React, so every answer is a table row.
 */

/** The API's limits (`feedback.schema.ts`, `feedback.upload.ts`). */
export const FEEDBACK_TITLE_MIN = 3
export const FEEDBACK_TITLE_MAX = 120
export const FEEDBACK_DESCRIPTION_MIN = 10
export const FEEDBACK_DESCRIPTION_MAX = 5000
export const FEEDBACK_DETAIL_MAX = 2000
export const FEEDBACK_RESPONSE_MAX = 2000
export const MAX_FEEDBACK_UPLOAD_BYTES = 15 * 1024 * 1024

/**
 * One file, where the web form takes four. The API reads every file of an
 * entry from one multipart request, and this app's uploader streams exactly one
 * file per request from disk (ADR-0007); sending more would mean holding them
 * all in memory, which is what that ADR exists to avoid. One screenshot or
 * recording is what a report from a phone almost always carries.
 */
export const MAX_FEEDBACK_ATTACHMENTS_ON_MOBILE = 1

/** Screenshots, screen recordings, and a log or PDF. No SVG and no archives, as the API holds. */
export const ALLOWED_FEEDBACK_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'text/plain',
]

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug_report: 'Bug report',
  feedback: 'Feedback',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: 'Won’t fix',
  duplicate: 'Duplicate',
}

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

/** Under each choice, so a reporter picks by effect rather than by adjective. */
export const FEEDBACK_SEVERITY_HINTS: Record<FeedbackSeverity, string> = {
  low: 'A cosmetic issue or a minor annoyance.',
  medium: 'Something doesn’t work, but there’s a way around it.',
  high: 'A key feature is broken with no workaround.',
  critical: 'I can’t use the app, or data is lost or exposed.',
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  account: 'Account & sign-in',
  messaging: 'Messaging',
  notifications: 'Notifications',
  attachments: 'Attachments & files',
  performance: 'Speed & performance',
  display: 'Layout & display',
  feature_request: 'Feature request',
  improvement: 'Improvement',
  usability: 'Ease of use',
  praise: 'Praise',
  other: 'Other',
}

export function feedbackCategories(kind: FeedbackKind): readonly FeedbackCategory[] {
  return kind === 'bug_report' ? BUG_REPORT_CATEGORIES : FEEDBACK_CATEGORIES
}

export function isFeedbackClosed(status: FeedbackStatus): boolean {
  return FEEDBACK_CLOSED_STATUSES.includes(status)
}

// ── The form ────────────────────────────────────────────────────────────────

/**
 * One set of values across the kind toggle, as on web: switching kind keeps
 * what was typed, and only the fields of the kind being sent go out.
 */
export type FeedbackDraft = {
  kind: FeedbackKind
  category: FeedbackCategory | null
  title: string
  description: string
  severity: FeedbackSeverity | null
  /** 0 is "not rated". */
  rating: number
  stepsToReproduce: string
  expectedBehavior: string
  actualBehavior: string
  allowContact: boolean
}

export function emptyFeedbackDraft(kind: FeedbackKind = 'bug_report'): FeedbackDraft {
  return {
    kind,
    category: null,
    title: '',
    description: '',
    severity: null,
    rating: 0,
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    allowContact: true,
  }
}

/** The draft after a kind switch. A category that belongs to the other kind is cleared. */
export function withFeedbackKind(draft: FeedbackDraft, kind: FeedbackKind): FeedbackDraft {
  const category =
    draft.category !== null && feedbackCategories(kind).includes(draft.category)
      ? draft.category
      : null
  return { ...draft, kind, category }
}

/** In the order the form draws them, so the first error is the first field. */
export type FeedbackField = 'category' | 'severity' | 'title' | 'description'

export type FeedbackCheck = {
  errors: Partial<Record<FeedbackField, string>>
  firstError: FeedbackField | null
}

const FIELD_ORDER: readonly FeedbackField[] = ['category', 'severity', 'title', 'description']

/** What the API would refuse, said before anything is sent. */
export function checkFeedbackDraft(draft: FeedbackDraft): FeedbackCheck {
  const errors: Partial<Record<FeedbackField, string>> = {}
  const title = draft.title.trim()
  const description = draft.description.trim()

  if (draft.category === null || !feedbackCategories(draft.kind).includes(draft.category)) {
    errors.category = 'Choose what this is about.'
  }
  if (draft.kind === 'bug_report' && draft.severity === null) {
    errors.severity = 'Choose how much this gets in your way.'
  }
  if (title.length < FEEDBACK_TITLE_MIN) {
    errors.title = `Give it a title of at least ${FEEDBACK_TITLE_MIN} characters.`
  } else if (title.length > FEEDBACK_TITLE_MAX) {
    errors.title = `Keep the title to ${FEEDBACK_TITLE_MAX} characters.`
  }
  if (description.length < FEEDBACK_DESCRIPTION_MIN) {
    errors.description = `Describe it in at least ${FEEDBACK_DESCRIPTION_MIN} characters.`
  } else if (description.length > FEEDBACK_DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${FEEDBACK_DESCRIPTION_MAX} characters.`
  }

  return { errors, firstError: FIELD_ORDER.find(field => errors[field] !== undefined) ?? null }
}

/** What the reporter never types: what they were using. */
export type FeedbackEnvironment = {
  platform: 'ios' | 'android'
  appVersion: string | null
  userAgent: string | null
  locale: string | null
  /** Window size in points, e.g. `390x844`. */
  width: number
  height: number
}

/**
 * The request's fields, every value a string as `CreateFeedbackSchema` reads a
 * multipart body: booleans as `"true"`/`"false"`, absent optionals left out
 * rather than sent blank, and each cut to the API's column limit so a long user
 * agent never fails the whole report.
 */
export function feedbackFields(
  draft: FeedbackDraft,
  environment: FeedbackEnvironment,
): Record<string, string> {
  const fields: Record<string, string> = {
    kind: draft.kind,
    category: draft.category ?? '',
    title: draft.title.trim(),
    description: draft.description.trim(),
    allowContact: draft.allowContact ? 'true' : 'false',
    platform: environment.platform,
  }
  const put = (name: string, value: string | null | undefined, max: number) => {
    const trimmed = value?.trim().slice(0, max)
    if (trimmed) fields[name] = trimmed
  }

  if (draft.kind === 'bug_report') {
    if (draft.severity) fields.severity = draft.severity
    put('stepsToReproduce', draft.stepsToReproduce, FEEDBACK_DETAIL_MAX)
    put('expectedBehavior', draft.expectedBehavior, FEEDBACK_DETAIL_MAX)
    put('actualBehavior', draft.actualBehavior, FEEDBACK_DETAIL_MAX)
  } else if (draft.rating >= 1 && draft.rating <= 5) {
    fields.rating = String(Math.round(draft.rating))
  }

  put('appVersion', environment.appVersion, 50)
  put('userAgent', environment.userAgent, 512)
  put('locale', environment.locale, 35)
  if (environment.width > 0 && environment.height > 0) {
    fields.viewport = `${Math.round(environment.width)}x${Math.round(environment.height)}`
  }

  return fields
}

/**
 * The MIME type to send a picked file as, or a sentence saying why it cannot
 * go. Size is only judged where the platform reported one; the API catches the
 * rest.
 */
export function feedbackAttachmentType(
  attachment: Pick<AttachmentView, 'uri' | 'name' | 'size'>,
): { ok: true; type: string } | { ok: false; reason: string } {
  const name = attachment.name.trim()
  const subject = name === '' ? 'That file' : `“${name}”`
  if (attachment.size != null && attachment.size > MAX_FEEDBACK_UPLOAD_BYTES) {
    return { ok: false, reason: `${subject} is larger than 15 MB.` }
  }
  const type = uploadMimeType(attachment)
  if (!type || !ALLOWED_FEEDBACK_MIME_TYPES.includes(type)) {
    return {
      ok: false,
      reason: `${subject} can’t be attached. Use a screenshot, a screen recording, a PDF or a text file.`,
    }
  }
  return { ok: true, type }
}

/** What the reporter is told once it has gone. */
export function feedbackSentSentence(kind: FeedbackKind, reference: string): string {
  const what = kind === 'bug_report' ? 'bug report' : 'feedback'
  return reference
    ? `Thanks. Your ${what} was sent as ${reference}.`
    : `Thanks. Your ${what} was sent.`
}

// ── Triage ──────────────────────────────────────────────────────────────────

export type FeedbackTab = 'open' | 'closed'

export const FEEDBACK_TABS: readonly { state: FeedbackTab; label: string }[] = [
  { state: 'open', label: 'Open' },
  { state: 'closed', label: 'Closed' },
]

export type FeedbackKindFilter = FeedbackKind | 'all'

export const FEEDBACK_KIND_FILTERS: readonly { kind: FeedbackKindFilter; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'bug_report', label: 'Bugs' },
  { kind: 'feedback', label: 'Feedback' },
]

export const FEEDBACK_STATUS_OPTIONS = FEEDBACK_STATUSES.map(status => ({
  status,
  label: FEEDBACK_STATUS_LABELS[status],
}))

export type TriageDraft = {
  status: FeedbackStatus
  severity: FeedbackSeverity | null
  internalNote: string
  response: string
}

export function triageDraftFor(entry: AdminFeedback): TriageDraft {
  return {
    status: entry.status,
    severity: entry.severity,
    internalNote: entry.internalNote ?? '',
    response: entry.response ?? '',
  }
}

export type TriageUpdate = {
  status?: FeedbackStatus
  severity?: FeedbackSeverity | null
  internalNote?: string | null
  response?: string | null
}

/**
 * Only what changed goes in the PATCH. The API records the admin as the
 * handler on any write and moves a `new` entry to `acknowledged` when a note or
 * response is written, so sending untouched fields would claim work nobody did.
 * Cleared text is sent as null. Null when nothing changed, which the API would
 * refuse.
 */
export function buildTriageUpdate(entry: AdminFeedback, draft: TriageDraft): TriageUpdate | null {
  const update: TriageUpdate = {}
  const note = draft.internalNote.trim()
  const response = draft.response.trim()

  if (draft.status !== entry.status) update.status = draft.status
  if (entry.kind === 'bug_report' && draft.severity !== entry.severity) update.severity = draft.severity
  if (note !== (entry.internalNote ?? '')) update.internalNote = note || null
  if (response !== (entry.response ?? '')) update.response = response || null

  return Object.keys(update).length > 0 ? update : null
}

/** The entry's tab after a save: one that left its tab leaves the list. */
export function withTriagedEntry(
  rows: AdminFeedback[],
  saved: AdminFeedback,
  tab: FeedbackTab,
): AdminFeedback[] {
  const belongs = (tab === 'closed') === isFeedbackClosed(saved.status)
  if (!belongs) return rows.filter(row => row.id !== saved.id)
  return rows.map(row => (row.id === saved.id ? saved : row))
}

/** New entries across both kinds, which is the number the Hub row asks somebody to read. */
export function newFeedbackCount(summary: FeedbackSummary | null): number {
  return summary ? summary.bugReports.new + summary.feedback.new : 0
}

/** The Hub row's second line. */
export function feedbackSummaryLine(summary: FeedbackSummary | null): string {
  if (!summary) return 'Bug reports and feedback from everyone'
  const open = summary.bugReports.open + summary.feedback.open
  if (open === 0) return 'Nothing open'
  const parts = [`${open} open`]
  const fresh = newFeedbackCount(summary)
  if (fresh > 0) parts.unshift(`${fresh} new`)
  if (summary.bugReports.critical > 0) parts.unshift(`${summary.bugReports.critical} critical`)
  return parts.join(' · ')
}

/** "4.3 / 5", or nothing before anyone has rated anything. */
export function formatAverageRating(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(1)} / 5`
}
