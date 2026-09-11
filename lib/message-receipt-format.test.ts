import { formatClockTime, formatReceiptStamp } from '@/lib/message-receipt-format'

function localIso(y: number, m: number, d: number, hour: number, minute = 0): string {
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

describe('formatClockTime', () => {
  test('reads as a time', () => {
    expect(formatClockTime(localIso(2026, 8, 13, 9, 8))).toMatch(/\b9[:.]08\b/)
  })

  test('an unreadable timestamp has no time', () => {
    expect(formatClockTime('not a date')).toBe('')
  })
})

describe('formatReceiptStamp', () => {
  const now = new Date(2026, 7, 13, 12).getTime()

  test('carries the day as well as the minute', () => {
    expect(formatReceiptStamp(localIso(2026, 8, 13, 9, 8), now)).toMatch(/^Today /)
    expect(formatReceiptStamp(localIso(2026, 8, 12, 9, 8), now)).toMatch(/^Yesterday /)
    expect(formatReceiptStamp(localIso(2026, 8, 10, 9, 8), now)).toMatch(/^Aug 10 /)
  })

  test('an unreadable timestamp has no stamp', () => {
    expect(formatReceiptStamp('not a date', now)).toBe('')
  })
})
