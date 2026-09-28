import {
  avatarInitials,
  firstName,
  formatRelativeTime,
  initials,
  isCompanyPersona,
} from '@/lib/display'

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

describe('isCompanyPersona', () => {
  test.each([
    ['company:org-1', true],
    ['company:app', true],
    ['agent-1', false],
    ['', false],
    ['Company:org-1', false],
    ['my-company:org-1', false],
  ])('%s → %s', (id, expected) => {
    expect(isCompanyPersona(id)).toBe(expected)
  })
})

describe('avatarInitials', () => {
  test('a person keeps their two initials', () => {
    expect(avatarInitials({ id: 'agent-1', name: 'Jonah Reed' })).toBe('JR')
  })

  test('the company persona is the first letter of its name', () => {
    expect(avatarInitials({ id: 'company:org-1', name: 'acme Support' })).toBe('A')
  })

  test('a persona with a blank name still draws something', () => {
    expect(avatarInitials({ id: 'company:app', name: '  ' })).toBe('?')
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
