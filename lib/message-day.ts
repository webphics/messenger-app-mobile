const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Which calendar day a message belongs to — the reader's, not UTC's.
 *
 * This was the ISO string's own date, which is UTC, and that is only the same
 * day the reader is having in a handful of zones. In UTC+6 it rolls over at six
 * in the evening: an exchange over one evening was split by a "Today" divider in
 * the middle of it, and every message after six was dated tomorrow. West of
 * Greenwich it fails the other way, folding the small hours into the day before.
 *
 * Local throughout, and built by hand rather than by slicing `toISOString()`,
 * which would put it back in UTC.
 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

export function dayKey(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const date = new Date(then)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function shouldShowDayDivider(currentIso: string, previousIso?: string): boolean {
  if (!previousIso) return true
  return dayKey(currentIso) !== dayKey(previousIso)
}

function localYmd(ms: number): { y: number; m: number; d: number } {
  const date = new Date(ms)
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() }
}

function sameDay(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

export function formatDayLabel(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const day = localYmd(then)
  const today = localYmd(nowMs)
  if (sameDay(day, today)) return 'Today'

  /**
   * Yesterday is the day before the reader's today rather than 24 hours back.
   * Subtracting a day's worth of milliseconds lands an hour out either side of a
   * daylight-saving change, which would lose a "Yesterday" once or twice a year.
   */
  const yesterday = localYmd(new Date(today.y, today.m, today.d - 1).getTime())
  if (sameDay(day, yesterday)) return 'Yesterday'

  const label = `${MONTHS[day.m]} ${day.d}`
  return day.y === today.y ? label : `${label}, ${day.y}`
}
