import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import {
  ANALYTICS_ACCESS,
  ROLE_GROUP_ACCESS,
  SCREEN_ACCESS,
  mayEnter,
  type Access,
  type GuardedScreen,
} from '@/lib/route-access'
import type { UserRole } from '@/lib/types'

function viewer(role: UserRole, ...capabilities: Capability[]) {
  return { role, capabilities }
}

describe('mayEnter', () => {
  test('nobody signed in enters anything, even a rule that asks for nothing', () => {
    expect(mayEnter(null, {})).toBe(false)
    expect(mayEnter(undefined, { roles: ['admin'] })).toBe(false)
  })

  test('a staff-only rule lets staff in and keeps a Customer out', () => {
    expect(mayEnter(viewer('agent'), { roles: ['admin', 'agent'] })).toBe(true)
    expect(mayEnter(viewer('customer'), { roles: ['admin', 'agent'] })).toBe(false)
  })

  test('both halves must hold: the role and a capability', () => {
    const access: Access = { roles: ['admin'], anyCapability: ['manage_labels'] }
    expect(mayEnter(viewer('admin', 'manage_labels'), access)).toBe(true)
    expect(mayEnter(viewer('agent', 'manage_labels'), access)).toBe(false)
    expect(mayEnter(viewer('admin'), access)).toBe(false)
  })

  test('an empty capability list is shut, not open: it is never satisfied', () => {
    expect(mayEnter(viewer('admin', ...CAPABILITIES), { anyCapability: [] })).toBe(false)
  })
})

describe('ROLE_GROUP_ACCESS', () => {
  const ROLES: UserRole[] = ['customer', 'agent', 'admin']

  test.each(ROLES)('a %s enters their own group and no other', (role) => {
    for (const group of ROLES) {
      expect(mayEnter(viewer(role, ...CAPABILITIES), ROLE_GROUP_ACCESS[group])).toBe(group === role)
    }
  })
})

describe('ANALYTICS_ACCESS', () => {
  test.each<[UserRole, Capability[], boolean]>([
    ['admin', ['view_team_analytics'], true],
    ['admin', ['view_team_activity'], false],
    ['agent', ['view_team_analytics'], false],
  ])('a %s holding %j: %s', (role, held, expected) => {
    expect(mayEnter(viewer(role, ...held), ANALYTICS_ACCESS)).toBe(expected)
  })
})

describe('SCREEN_ACCESS', () => {
  test.each<[GuardedScreen, Capability[], boolean]>([
    ['users', ['manage_users'], true],
    ['users', ['manage_team'], false],
    ['organizations', ['manage_memberships'], true],
    ['labels', ['manage_labels'], true],
    ['saved-responses', ['manage_labels'], false],
    ['activity', ['view_team_activity'], true],
  ])('an Admin holding %s → %j: %s', (screen, held, expected) => {
    expect(mayEnter(viewer('admin', ...held), SCREEN_ACCESS[screen])).toBe(expected)
  })

  test.each<UserRole>(['agent', 'customer'])(
    'a %s enters none of them, whatever they hold',
    (role) => {
      const everything = viewer(role, ...CAPABILITIES)
      for (const access of Object.values(SCREEN_ACCESS)) {
        expect(mayEnter(everything, access)).toBe(false)
      }
    },
  )
})
