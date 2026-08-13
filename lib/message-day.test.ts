import { dayKey, formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'

describe('dayKey', () => {
  test('UTC calendar day', () => {
    expect(dayKey('2026-08-13T08:00:00.000Z')).toBe('2026-08-13')
    expect(dayKey('2026-08-12T16:05:00.000Z')).toBe('2026-08-12')
  })
})

describe('shouldShowDayDivider', () => {
  test('true when previous is missing or different day', () => {
    expect(shouldShowDayDivider('2026-08-13T08:00:00.000Z', undefined)).toBe(true)
    expect(shouldShowDayDivider('2026-08-13T08:12:00.000Z', '2026-08-13T08:00:00.000Z')).toBe(false)
    expect(shouldShowDayDivider('2026-08-13T08:00:00.000Z', '2026-08-12T16:05:00.000Z')).toBe(true)
  })
})

describe('formatDayLabel', () => {
  const now = Date.parse('2026-08-13T12:00:00.000Z')

  test('today / yesterday / date', () => {
    expect(formatDayLabel('2026-08-13T08:00:00.000Z', now)).toBe('Today')
    expect(formatDayLabel('2026-08-12T16:05:00.000Z', now)).toBe('Yesterday')
    expect(formatDayLabel('2026-08-10T10:00:00.000Z', now)).toBe('Aug 10')
  })
})
