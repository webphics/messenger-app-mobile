import { firstName, formatRelativeTime, initials } from '@/lib/display'

describe('firstName', () => {
  test('returns the first token', () => {
    expect(firstName('Luis Ferreira')).toBe('Luis')
  })
})

describe('initials', () => {
  test('uses first two name parts', () => {
    expect(initials('Luis Ferreira')).toBe('LF')
  })

  test('single token uses one letter', () => {
    expect(initials('Offers')).toBe('O')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-13T12:00:00.000Z')

  test('same minute is just now', () => {
    expect(formatRelativeTime('2026-08-13T11:59:30.000Z', now)).toBe('just now')
  })

  test('hours ago', () => {
    expect(formatRelativeTime('2026-08-13T08:12:00.000Z', now)).toBe('3h ago')
  })

  test('yesterday-ish days', () => {
    expect(formatRelativeTime('2026-08-12T16:05:00.000Z', now)).toBe('19h ago')
  })
})
