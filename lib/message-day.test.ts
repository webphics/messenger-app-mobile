import { dayKey, formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'

/**
 * Built from local parts rather than written as UTC literals, so these say the
 * same thing on a machine in any zone. A `Z` literal would only assert local-day
 * behaviour on a machine that happens to be at UTC — which is exactly the case
 * that hid the bug these cover.
 */
function localIso(y: number, m: number, d: number, hour: number, minute = 0): string {
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

describe('dayKey', () => {
  test('the reader’s calendar day, not UTC’s', () => {
    expect(dayKey(localIso(2026, 8, 13, 8))).toBe('2026-08-13')
    // Late enough that any zone east of Greenwich has already rolled over in UTC.
    expect(dayKey(localIso(2026, 8, 13, 23, 30))).toBe('2026-08-13')
    // Early enough that any zone west of it has not yet.
    expect(dayKey(localIso(2026, 8, 13, 0, 30))).toBe('2026-08-13')
  })

  test('an unreadable timestamp has no day', () => {
    expect(dayKey('not a date')).toBe('')
  })
})

describe('shouldShowDayDivider', () => {
  test('true when previous is missing or a different day', () => {
    expect(shouldShowDayDivider(localIso(2026, 8, 13, 8), undefined)).toBe(true)
    expect(shouldShowDayDivider(localIso(2026, 8, 13, 8, 12), localIso(2026, 8, 13, 8))).toBe(false)
    expect(shouldShowDayDivider(localIso(2026, 8, 13, 8), localIso(2026, 8, 12, 22))).toBe(true)
  })

  test('one evening is one day', () => {
    // The pair that used to straddle the UTC midnight in UTC+6 and split the
    // evening in two.
    expect(shouldShowDayDivider(localIso(2026, 8, 13, 23), localIso(2026, 8, 13, 17))).toBe(false)
  })
})

describe('formatDayLabel', () => {
  const now = new Date(2026, 7, 13, 12).getTime()

  test('today / yesterday / date', () => {
    expect(formatDayLabel(localIso(2026, 8, 13, 8), now)).toBe('Today')
    expect(formatDayLabel(localIso(2026, 8, 13, 23, 30), now)).toBe('Today')
    expect(formatDayLabel(localIso(2026, 8, 12, 22), now)).toBe('Yesterday')
    expect(formatDayLabel(localIso(2026, 8, 10, 10), now)).toBe('Aug 10')
  })

  test('a different year says so', () => {
    expect(formatDayLabel(localIso(2025, 8, 10, 10), now)).toBe('Aug 10, 2025')
  })

  test('an unreadable timestamp has no label', () => {
    expect(formatDayLabel('not a date', now)).toBe('')
  })
})
