import { filterStaff, presenceLabel, staffDmIntent } from '@/lib/staff-directory'
import type { StaffDirectoryUser } from '@/lib/types'

function staff(overrides: Partial<StaffDirectoryUser> = {}): StaffDirectoryUser {
  return {
    id: 'agent-1',
    name: 'Jonah Reed',
    role: 'agent',
    isOnline: false,
    lastOnlineAt: null,
    sharedOrganizations: [{ id: 'org-1', name: 'Talo' }],
    ...overrides,
  }
}

describe('staffDmIntent', () => {
  test('one shared organization binds to it', () => {
    expect(staffDmIntent(staff())).toEqual({ kind: 'start', organizationId: 'org-1' })
  })

  test('several shared organizations are a choice, not a guess', () => {
    const organizations = [
      { id: 'org-1', name: 'Talo' },
      { id: 'org-2', name: 'Northwind' },
    ]
    expect(staffDmIntent(staff({ sharedOrganizations: organizations }))).toEqual({
      kind: 'choose',
      organizations,
    })
  })

  test('no shared organization means no conversation can exist', () => {
    expect(staffDmIntent(staff({ sharedOrganizations: [] }))).toEqual({ kind: 'impossible' })
  })

  test('a payload that did not say leaves the decision to the API', () => {
    expect(staffDmIntent(staff({ sharedOrganizations: null }))).toEqual({ kind: 'start' })
  })
})

describe('filterStaff', () => {
  const people = [
    staff({ id: 'a', name: 'Jonah Reed', role: 'agent' }),
    staff({ id: 'b', name: 'Priya Raman', role: 'admin' }),
  ]

  test('an empty query keeps everyone, and the same array', () => {
    expect(filterStaff(people, '   ')).toBe(people)
  })

  test('matches a name, case and padding aside', () => {
    expect(filterStaff(people, ' priya ').map((user) => user.id)).toEqual(['b'])
  })

  test('matches a role', () => {
    expect(filterStaff(people, 'agent').map((user) => user.id)).toEqual(['a'])
  })

  test('answers nothing when nobody matches', () => {
    expect(filterStaff(people, 'zzz')).toEqual([])
  })
})

describe('presenceLabel', () => {
  const now = Date.parse('2026-08-13T10:00:00.000Z')

  test('online is said in the present tense', () => {
    expect(presenceLabel(staff({ isOnline: true }), now)).toBe('Active now')
  })

  test('offline with a last-seen time reports it', () => {
    expect(
      presenceLabel(staff({ isOnline: false, lastOnlineAt: '2026-08-13T09:00:00.000Z' }), now),
    ).toBe('Active 1h ago')
  })

  test('offline with nothing to report says so', () => {
    expect(presenceLabel(staff({ isOnline: false, lastOnlineAt: null }), now)).toBe('Offline')
  })

  test('a row carrying no presence at all claims nothing', () => {
    const { isOnline: _absent, ...withoutPresence } = staff({ lastOnlineAt: null })
    expect(presenceLabel(withoutPresence as StaffDirectoryUser, now)).toBe('')
  })
})
