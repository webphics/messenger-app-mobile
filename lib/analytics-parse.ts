import { asRecord } from '@/lib/api-envelope'
import type {
  AnalyticsOverview,
  AnalyticsResolution,
  AnalyticsSeriesPoint,
  AnalyticsSnapshot,
  AnalyticsUserCounts,
} from '@/lib/types'

/**
 * Reading `GET /analytics/overview` into this app's types.
 *
 * Pure and separate from the request, as `lib/wall-parse` and
 * `lib/conversation-parse` are, and under the same rules: a parser answers null
 * for a payload it cannot read, and what is required is what this app would be
 * inventing if it defaulted.
 *
 * Counts are the one thing here that must never be invented, which is why
 * `count` refuses a missing field rather than falling back to zero. Every number
 * in this payload is something an Admin reads as a fact about their desk — a
 * zero drawn because a field was absent is a claim that nothing happened, and a
 * chart is the worst place to make one. A page this client cannot read draws no
 * charts at all instead.
 *
 * A day in `series` is the exception, and only within itself: a point missing
 * either of its two counts is dropped from the series rather than failing the
 * whole overview, exactly as one unreadable Post does not empty a Wall.
 */

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function isoDay(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function parseUserCounts(data: unknown): AnalyticsUserCounts | null {
  const record = asRecord(data)
  if (!record) return null

  const admin = count(record.admin)
  const agent = count(record.agent)
  const customer = count(record.customer)
  if (admin === null || agent === null || customer === null) return null

  return { admin, agent, customer }
}

function parseSnapshot(data: unknown): AnalyticsSnapshot | null {
  const record = asRecord(data)
  if (!record) return null

  const unassigned = count(record.unassigned)
  const engaged = count(record.engaged)
  const closed = count(record.closed)
  const groups = count(record.groups)
  const users = parseUserCounts(record.users)
  if (unassigned === null || engaged === null || closed === null || groups === null || !users) {
    return null
  }

  return { unassigned, engaged, closed, groups, users }
}

function parseResolution(data: unknown): AnalyticsResolution | null {
  const record = asRecord(data)
  if (!record) return null

  const opened = count(record.opened)
  const closed = count(record.closed)
  if (opened === null || closed === null) return null

  return { opened, closed }
}

export function parseAnalyticsSeriesPoint(data: unknown): AnalyticsSeriesPoint | null {
  const record = asRecord(data)
  if (!record) return null

  const date = isoDay(record.date)
  const conversationsOpened = count(record.conversationsOpened)
  const messagesSent = count(record.messagesSent)
  if (date === null || conversationsOpened === null || messagesSent === null) return null

  return { date, conversationsOpened, messagesSent }
}

function parseRange(data: unknown): { from: string; to: string } | null {
  const record = asRecord(data)
  if (!record) return null

  const from = timestamp(record.from)
  const to = timestamp(record.to)
  if (from === null || to === null) return null

  return { from, to }
}

export function parseAnalyticsOverview(data: unknown): AnalyticsOverview | null {
  const record = asRecord(data)
  if (!record) return null

  const range = parseRange(record.range)
  const snapshot = parseSnapshot(record.snapshot)
  const resolution = parseResolution(record.resolution)
  if (!range || !snapshot || !resolution) return null

  // An absent `series` is an empty one rather than a refusal: a range with no
  // activity in it is a real answer, and the snapshot beside it is still true.
  const rawSeries = Array.isArray(record.series) ? record.series : []
  const series = rawSeries
    .map(parseAnalyticsSeriesPoint)
    .filter((point): point is AnalyticsSeriesPoint => point !== null)

  return { range, snapshot, resolution, series }
}
