import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import {
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
  test.each<[string, Access]>([
    ['no rule at all', {}],
    ['a role rule', { roles: ['admin'] }],
    ['a capability rule', { anyCapability: ['manage_labels'] }],
  ])('nobody signed in enters nothing, even with %s', (_label, access) => {
    expect(mayEnter(null, access)).toBe(false)
    expect(mayEnter(undefined, access)).toBe(false)
  })

  test('a rule asking for nothing lets any signed-in viewer in', () => {
    expect(mayEnter(viewer('customer'), {})).toBe(true)
  })

  test.each<[UserRole, boolean]>([
    ['admin', true],
    ['agent', true],
    ['customer', false],
  ])('a staff-only rule and a %s: %s', (role, expected) => {
    expect(mayEnter(viewer(role), { roles: ['admin', 'agent'] })).toBe(expected)
  })

  test('one capability out of several is enough', () => {
    const access: Access = { anyCapability: ['manage_organizations', 'manage_memberships'] }
    expect(mayEnter(viewer('admin', 'manage_memberships'), access)).toBe(true)
    expect(mayEnter(viewer('admin', 'close'), access)).toBe(false)
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

  test('an empty role list lets nobody in', () => {
    expect(mayEnter(viewer('admin', ...CAPABILITIES), { roles: [] })).toBe(false)
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

describe('SCREEN_ACCESS', () => {
  test.each<[GuardedScreen, Capability[], boolean]>([
    ['users', ['manage_users'], true],
    ['users', ['change_roles'], true],
    ['users', ['manage_permissions'], true],
    ['users', ['manage_team'], false],
    ['organizations', ['manage_organizations'], true],
    ['organizations', ['manage_memberships'], true],
    ['organizations', ['manage_users'], false],
    ['organization/[id]', ['manage_memberships'], true],
    ['organization/[id]', [], false],
    ['labels', ['manage_labels'], true],
    ['labels', ['close'], false],
    ['saved-responses', ['manage_canned_replies'], true],
    ['saved-responses', ['manage_labels'], false],
    ['activity', ['view_team_activity'], true],
    ['activity', ['view_team_analytics'], false],
    ['chart/[id]', ['view_team_analytics'], true],
    ['chart/[id]', ['view_team_activity'], false],
    ['offer-add', [], true],
  ])('an Admin holding %s → %j: %s', (screen, held, expected) => {
    expect(mayEnter(viewer('admin', ...held), SCREEN_ACCESS[screen])).toBe(expected)
  })

  test('an Admin holding everything enters every screen', () => {
    const everything = viewer('admin', ...CAPABILITIES)
    for (const access of Object.values(SCREEN_ACCESS)) {
      expect(mayEnter(everything, access)).toBe(true)
    }
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

  test('every screen that asks for a capability names at least one', () => {
    for (const access of Object.values(SCREEN_ACCESS) as Access[]) {
      if (access.anyCapability !== undefined) {
        expect(access.anyCapability.length).toBeGreaterThan(0)
      }
    }
  })
})
