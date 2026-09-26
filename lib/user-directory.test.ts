import {
  invitableOrganizations,
  isSelf,
  membershipSummary,
  otherRoles,
  unmanageableIds,
  userDisplayName,
  userFlags,
  userRoleLabel,
  userRowActions,
  canCreateAccounts,
} from '@/lib/user-directory'
import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import { parseManagedUser } from '@/lib/user-parse'
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

const EVERYTHING = CAPABILITIES

const TALO = { id: 'org-1', name: 'Talo' }
const NORTHWIND = { id: 'org-2', name: 'Northwind' }

describe('userDisplayName', () => {
  test('the name when there is one', () => {
    expect(userDisplayName(user())).toBe('Jonah Reed')
  })

  test('the email when there is not — an invited account may have no name yet', () => {
    expect(userDisplayName(user({ name: null }))).toBe('jonah@talo.test')
    expect(userDisplayName(user({ name: '   ' }))).toBe('jonah@talo.test')
  })
})

describe('userFlags', () => {
  test('a healthy account flags nothing', () => {
    expect(userFlags(user())).toEqual([])
  })

  test('a ban comes first, because it changes what the account can do', () => {
    const flags = userFlags(user({ isBanned: true, emailVerified: false }))
    expect(flags.map((flag) => flag.label)).toEqual(['Banned', 'Unverified'])
    expect(flags[0]!.tone).toBe('danger')
  })

  test('sessions are counted in words rather than pluralised wrongly', () => {
    expect(userFlags(user({ activeSessionCount: 1 })).map((f) => f.label)).toEqual([
      '1 session',
    ])
    expect(userFlags(user({ activeSessionCount: 3 })).map((f) => f.label)).toEqual([
      '3 sessions',
    ])
  })

  test('a second factor is worth saying, and its absence is not', () => {
    expect(userFlags(user({ is2faEnabled: true })).map((f) => f.label)).toEqual(['2FA'])
    expect(userFlags(user({ is2faEnabled: false }))).toEqual([])
  })
})

describe('membershipSummary', () => {
  test('nowhere yet', () => {
    expect(membershipSummary(user())).toBe('No organization yet')
  })

  test('joined and invited are different words, never one total', () => {
    const row = user({
      organizations: [TALO],
      pendingInvitations: [{ id: 'inv-1', organization: NORTHWIND }],
    })
    expect(membershipSummary(row)).toBe('1 organization · 1 invited')
  })

  test('invited but in none says so rather than reading as a member', () => {
    const row = user({ pendingInvitations: [{ id: 'inv-1', organization: TALO }] })
    expect(membershipSummary(row)).toBe('1 invited')
  })
})

describe('isSelf', () => {
  test('an Admin is not offered destructive actions on their own account', () => {
    expect(isSelf(user({ id: 'me' }), 'me')).toBe(true)
    expect(isSelf(user({ id: 'other' }), 'me')).toBe(false)
  })

  test('a viewer nobody has identified is nobody', () => {
    expect(isSelf(user(), null)).toBe(false)
  })
})

describe('userRowActions', () => {
  test('a viewer holding everything is offered every action on an ordinary row', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', ...EVERYTHING))).toEqual({
      account: true,
      changeRole: true,
      removeMembership: true,
      invite: true,
    })
  })

  test('the account actions need manage_users', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', 'manage_users'))).toEqual({
      account: true,
      changeRole: false,
      removeMembership: false,
      invite: false,
    })
  })

  test('the role change needs change_roles', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', 'change_roles'))).toEqual({
      account: false,
      changeRole: true,
      removeMembership: false,
      invite: false,
    })
  })

  test('the role change also needs the row to say the viewer may change it', () => {
    const row = user({ id: 'other', roleEditable: false })
    expect(userRowActions(row, viewer('me', ...EVERYTHING)).changeRole).toBe(false)
  })

  test('removing and inviting need manage_memberships', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', 'manage_memberships'))).toEqual({
      account: false,
      changeRole: false,
      removeMembership: true,
      invite: true,
    })
  })

  test('a viewer holding only manage_permissions is offered nothing here', () => {
    expect(userRowActions(user({ id: 'other' }), viewer('me', 'manage_permissions'))).toEqual({
      account: false,
      changeRole: false,
      removeMembership: false,
      invite: false,
    })
  })

  test('a row the API will not let anyone manage offers nothing that changes it', () => {
    const row = user({ id: 'other', manageable: false })
    expect(userRowActions(row, viewer('me', ...EVERYTHING))).toEqual({
      account: false,
      changeRole: false,
      removeMembership: false,
      invite: false,
    })
  })

  test('nobody signed in is offered nothing', () => {
    expect(userRowActions(user(), null)).toEqual({
      account: false,
      changeRole: false,
      removeMembership: false,
      invite: false,
    })
  })

  test('your own row keeps invite and drops the rest, as before', () => {
    expect(userRowActions(user({ id: 'me' }), viewer('me', ...EVERYTHING))).toEqual({
      account: false,
      changeRole: false,
      removeMembership: false,
      invite: true,
    })
  })

  test('a row from an API that sends no roleEditable offers no role change', () => {
    const row = parseManagedUser({ id: 'other', email: 'a@talo.test', role: 'admin' })
    expect(row).not.toBeNull()
    expect(userRowActions(row!, viewer('me', ...EVERYTHING))).toEqual({
      account: true,
      changeRole: false,
      removeMembership: true,
      invite: true,
    })
  })
})

describe('canCreateAccounts', () => {
  test('needs manage_users', () => {
    expect(canCreateAccounts(viewer('me', 'manage_users'))).toBe(true)
    expect(canCreateAccounts(viewer('me', 'change_roles', 'manage_permissions'))).toBe(false)
    expect(canCreateAccounts(null)).toBe(false)
  })
})

describe('unmanageableIds', () => {
  test('only the rows the API marks, so a members list can drop their buttons', () => {
    const rows = [
      user({ id: 'a' }),
      user({ id: 'b', manageable: false }),
      user({ id: 'c' }),
    ]
    expect([...unmanageableIds(rows)]).toEqual(['b'])
  })

  test('nobody when the directory has not loaded', () => {
    expect(unmanageableIds([]).size).toBe(0)
  })
})

describe('otherRoles', () => {
  test('the two a row is not', () => {
    expect(otherRoles('agent')).toEqual(['admin', 'customer'])
    expect(otherRoles('admin')).toEqual(['agent', 'customer'])
  })

  test('every role has a label', () => {
    for (const role of otherRoles('admin')) expect(userRoleLabel(role)).not.toBe('')
  })
})

describe('invitableOrganizations', () => {
  test('neither the ones they are in nor the ones already pending', () => {
    const row = user({
      organizations: [TALO],
      pendingInvitations: [{ id: 'inv-1', organization: NORTHWIND }],
    })
    const third = { id: 'org-3', name: 'Kestrel' }
    expect(invitableOrganizations([TALO, NORTHWIND, third], row)).toEqual([third])
  })

  test('a declined invitation can be sent again — it answered one ask, not every ask', () => {
    const row = user({ declinedInvitations: [{ id: 'inv-1', organization: TALO }] })
    expect(invitableOrganizations([TALO], row)).toEqual([TALO])
  })
})
