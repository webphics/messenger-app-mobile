const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function shouldShowDayDivider(currentIso: string, previousIso?: string): boolean {
  if (!previousIso) return true
  return dayKey(currentIso) !== dayKey(previousIso)
}

function utcYmd(ms: number): { y: number; m: number; d: number } {
  const dt = new Date(ms)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() }
}

export function formatDayLabel(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const a = utcYmd(then)
  const b = utcYmd(nowMs)
  if (a.y === b.y && a.m === b.m && a.d === b.d) return 'Today'
  const yesterday = utcYmd(nowMs - 86_400_000)
  if (a.y === yesterday.y && a.m === yesterday.m && a.d === yesterday.d) return 'Yesterday'
  return `${MONTHS[a.m]} ${a.d}`
}
