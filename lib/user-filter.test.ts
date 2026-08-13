import { filterUsers, mockEmail } from '@/lib/user-filter'
import type { Person } from '@/lib/types'

const PEOPLE: Person[] = [
  {
    id: 'a',
    displayName: 'Amina Okonkwo',
    role: 'admin',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'b',
    displayName: 'Jonah Reed',
    role: 'agent',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 12h ago',
  },
  {
    id: 'c',
    displayName: 'Luis Ferreira',
    role: 'contact',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
]

describe('mockEmail', () => {
  test('slugs display name', () => {
    expect(mockEmail('Amina Okonkwo')).toBe('amina.okonkwo@support.local')
  })
})

describe('filterUsers', () => {
  test('empty query returns all matching chip', () => {
    expect(filterUsers(PEOPLE, '  ', 'all', false).map((p) => p.id)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(filterUsers(PEOPLE, '', 'agent', false).map((p) => p.id)).toEqual(['b'])
  })

  test('online only', () => {
    expect(filterUsers(PEOPLE, '', 'all', true).map((p) => p.id)).toEqual(['a', 'c'])
  })

  test('matches name, role, or email', () => {
    expect(filterUsers(PEOPLE, 'amina', 'all', false).map((p) => p.id)).toEqual(['a'])
    expect(filterUsers(PEOPLE, 'contact', 'all', false).map((p) => p.id)).toEqual(['c'])
    expect(filterUsers(PEOPLE, 'jonah.reed', 'all', false).map((p) => p.id)).toEqual(['b'])
  })
})
