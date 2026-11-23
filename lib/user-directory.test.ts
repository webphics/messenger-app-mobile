import { memberDisplayName, userRowActions } from '@/lib/user-directory'
import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import type { ManagedUser } from '@/lib/types'

function user(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: 'user-1',
    name: 'Jonah Reed',
    email: 'jonah@talo.test',
    phone: null,
    role: 'agent',
    emailVerified: true,
    is2faEnabled: false,
    isBanned: false,
    banReason: null,
    banExpires: null,
    activeSessionCount: 0,
    organizations: [],
    pendingInvitations: [],
    declinedInvitations: [],
    createdAt: '',
    updatedAt: '',
    manageable: true,
    roleEditable: true,
    ...overrides,
  }
}

function viewer(id: string, ...capabilities: Capability[]) {
  return { id, capabilities }
}

const NONE = {
  account: false,
  changeRole: false,
  removeMembership: false,
  invite: false,
}

describe('userRowActions', () => {
  test('a viewer holding everything is offered every action on an ordinary row', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', ...CAPABILITIES))).toEqual({
      account: true,
      changeRole: true,
      removeMembership: true,
      invite: true,
    })
  })

  test('each action needs its own capability', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', 'manage_users'))).toEqual({
      ...NONE,
      account: true,
    })
  })

  test('a row the API will not let anyone manage offers nothing that changes it', () => {
    const row = user({ id: 'other', manageable: false })
    expect(userRowActions(row, viewer('me', ...CAPABILITIES))).toEqual(NONE)
  })

  test('your own row keeps invite and drops the rest', () => {
    // The API permits self-ban and self-delete; this is the client's rule.
    expect(userRowActions(user({ id: 'me' }), viewer('me', ...CAPABILITIES))).toEqual({
      ...NONE,
      invite: true,
    })
  })

  test('the role change also needs the row to say the viewer may change it', () => {
    const row = user({ id: 'other', roleEditable: false })
    expect(userRowActions(row, viewer('me', ...CAPABILITIES)).changeRole).toBe(false)
  })
})

describe('memberDisplayName', () => {
  it.each([
    ['their name', { name: 'Jonah Reed' }, 'jonah@talo.test', 'Jonah Reed'],
    ['their name over an email', { name: 'Jonah Reed' }, undefined, 'Jonah Reed'],
    ['the directory email when unnamed', { name: '' }, 'jonah@talo.test', 'jonah@talo.test'],
    ['the directory email when the name is blank', { name: '  ' }, 'jonah@talo.test', 'jonah@talo.test'],
    ['a placeholder with no email to borrow', { name: '' }, undefined, 'Unnamed member'],
    ['a placeholder with a blank email', { name: '' }, ' ', 'Unnamed member'],
  ])('prints %s', (_label, member, email, expected) => {
    expect(memberDisplayName(member, email)).toBe(expected)
  })
})
