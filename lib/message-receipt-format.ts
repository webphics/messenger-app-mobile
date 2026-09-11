import { formatDayLabel } from '@/lib/message-day'

/**
 * The clock time a message or a receipt carries, in the reader's own zone and
 * their locale's own shape — twelve hours or twenty-four is theirs to decide,
 * not this app's.
 */
export function formatClockTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  return new Date(then).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * A receipt's full stamp: the day and the minute.
 *
 * The day is not decoration. This screen is reachable from any message in the
 * thread rather than only the newest, so "9:08 AM" on its own is ambiguous the
 * moment the message is older than today — and a receipt can land on a later day
 * than the message it belongs to, which is precisely the case somebody opens
 * this to understand.
 */
export function formatReceiptStamp(iso: string, nowMs = Date.now()): string {
  const day = formatDayLabel(iso, nowMs)
  const time = formatClockTime(iso)
  if (!day || !time) return ''
  return `${day} ${time}`
}
