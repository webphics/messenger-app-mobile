import { asRecord } from '@/lib/api-envelope'

/**
 * Reading the API's feedback payloads (`modules/feedback` in messenger-api).
 *
 * The rules are `lib/report-parse`'s: null for a payload this client cannot
 * read, and a page drops the rows it cannot read rather than failing — one
 * unreadable entry must not hide every other one from the person triaging them.
 */

export const FEEDBACK_KINDS = ['bug_report', 'feedback'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_STATUSES = [
  'new',
  'acknowledged',
  'in_progress',
  'resolved',
  'wont_fix',
  'duplicate',
] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/** Terminal: the API stamps `resolvedAt` on these and its `state=closed` filter reads them. */
export const FEEDBACK_CLOSED_STATUSES: readonly FeedbackStatus[] = ['resolved', 'wont_fix', 'duplicate']

export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number]

export const BUG_REPORT_CATEGORIES = [
  'account',
  'messaging',
  'notifications',
  'attachments',
  'performance',
  'display',
  'other',
] as const

export const FEEDBACK_CATEGORIES = [
  'feature_request',
  'improvement',
  'usability',
  'praise',
  'other',
] as const

export type FeedbackCategory =
  | (typeof BUG_REPORT_CATEGORIES)[number]
  | (typeof FEEDBACK_CATEGORIES)[number]

const ALL_CATEGORIES: readonly FeedbackCategory[] = [
  ...BUG_REPORT_CATEGORIES,
  ...FEEDBACK_CATEGORIES.filter(category => category !== 'other'),
]

const PLATFORMS = ['web', 'ios', 'android'] as const
export type FeedbackPlatform = (typeof PLATFORMS)[number]

/** What the reporter gets back. Nothing else is ever read back to them. */
export type FeedbackReceipt = {
  id: string
  /** `BUG-12` or `FB-12`, for quoting in a conversation. */
  reference: string
  kind: FeedbackKind
}

export type FeedbackAttachment = {
  url: string
  fileName: string | null
  mimeType: string
  size: number
}

export type FeedbackPerson = {
  id: string
  name: string
  email: string | null
  role: string | null
}

/** One entry as the super admin triages it. */
export type AdminFeedback = {
  id: string
  reference: string
  kind: FeedbackKind
  status: FeedbackStatus
  category: FeedbackCategory | null
  severity: FeedbackSeverity | null
  rating: number | null
  title: string
  description: string
  stepsToReproduce: string | null
  expectedBehavior: string | null
  actualBehavior: string | null
  attachments: FeedbackAttachment[]
  platform: FeedbackPlatform | null
  appVersion: string | null
  allowContact: boolean
  response: string | null
  internalNote: string | null
  pageUrl: string | null
  userAgent: string | null
  locale: string | null
  viewport: string | null
  /** Null once the reporter's account has been deleted. */
  reporter: FeedbackPerson | null
  handledBy: FeedbackPerson | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string | null
}

export type AdminFeedbackPage = {
  rows: AdminFeedback[]
  total: number
  page: number
  pageSize: number
}

export type FeedbackSummary = {
  bugReports: { open: number; new: number; critical: number }
  feedback: { open: number; new: number; averageRating: number | null }
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

export function parseFeedbackReceipt(data: unknown): FeedbackReceipt | null {
  const row = asRecord(data)
  if (!row) return null
  const id = text(row.id)
  const kind = oneOf(row.kind, FEEDBACK_KINDS)
  if (!id || !kind) return null
  return { id, reference: text(row.reference) ?? '', kind }
}

function parsePerson(data: unknown): FeedbackPerson | null {
  const row = asRecord(data)
  if (!row) return null
  const id = text(row.id)
  const name = text(row.name)
  if (!id || !name) return null
  return { id, name, email: text(row.email), role: text(row.role) }
}

function parseAttachment(data: unknown): FeedbackAttachment | null {
  const row = asRecord(data)
  if (!row) return null
  const url = text(row.url)
  const mimeType = text(row.mimeType)
  if (!url || !mimeType) return null
  return { url, fileName: text(row.fileName), mimeType, size: count(row.size) }
}

function rating(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null
}

/**
 * An entry, or null for one missing what a triager needs: what it is, where it
 * stands, what it says, and when it came in. A category or severity this build
 * does not know reads as none rather than refusing the entry.
 */
export function parseAdminFeedback(data: unknown): AdminFeedback | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const kind = oneOf(row.kind, FEEDBACK_KINDS)
  const status = oneOf(row.status, FEEDBACK_STATUSES)
  const title = text(row.title)
  const createdAt = text(row.createdAt)
  if (!id || !kind || !status || !title || !createdAt) return null

  const attachments = Array.isArray(row.attachments) ? row.attachments : []

  return {
    id,
    reference: text(row.reference) ?? '',
    kind,
    status,
    category: oneOf(row.category, ALL_CATEGORIES),
    severity: oneOf(row.severity, FEEDBACK_SEVERITIES),
    rating: rating(row.rating),
    title,
    description: text(row.description) ?? '',
    stepsToReproduce: text(row.stepsToReproduce),
    expectedBehavior: text(row.expectedBehavior),
    actualBehavior: text(row.actualBehavior),
    attachments: attachments
      .map(parseAttachment)
      .filter((attachment): attachment is FeedbackAttachment => attachment !== null),
    platform: oneOf(row.platform, PLATFORMS),
    appVersion: text(row.appVersion),
    allowContact: row.allowContact === true,
    response: text(row.response),
    internalNote: text(row.internalNote),
    pageUrl: text(row.pageUrl),
    userAgent: text(row.userAgent),
    locale: text(row.locale),
    viewport: text(row.viewport),
    reporter: parsePerson(row.reporter),
    handledBy: parsePerson(row.handledBy),
    resolvedAt: text(row.resolvedAt),
    createdAt,
    updatedAt: text(row.updatedAt),
  }
}

export function parseAdminFeedbackPage(data: unknown): AdminFeedbackPage | null {
  const page = asRecord(data)
  if (!page || !Array.isArray(page.rows)) return null
  const rows = page.rows
    .map(parseAdminFeedback)
    .filter((entry): entry is AdminFeedback => entry !== null)
  return {
    rows,
    total: count(page.total),
    page: count(page.page) || 1,
    pageSize: count(page.pageSize) || rows.length,
  }
}

export function parseFeedbackSummary(data: unknown): FeedbackSummary | null {
  const row = asRecord(data)
  const bugs = asRecord(row?.bugReports)
  const feedback = asRecord(row?.feedback)
  if (!bugs || !feedback) return null
  const average = feedback.averageRating
  return {
    bugReports: { open: count(bugs.open), new: count(bugs.new), critical: count(bugs.critical) },
    feedback: {
      open: count(feedback.open),
      new: count(feedback.new),
      averageRating: typeof average === 'number' && Number.isFinite(average) ? average : null,
    },
  }
}
