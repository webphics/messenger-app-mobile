import { memberScreenRows, type MembersState } from '@/lib/organization-members'
import type { ManagedUser, OrganizationMember } from '@/lib/types'
import { memberDisplayName, userDisplayName } from '@/lib/user-directory'

function user(id: string, name: string | null = id): ManagedUser {
  return {
    id,
    name,
    email: `${id}@talo.test`,
    phone: null,
    role: 'customer',
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
  }
}

const member = (id: string, name = id): OrganizationMember => ({ id, name, role: 'customer' })

const directory = [user('ada'), user('bo'), user('cy')]
const ready: MembersState = { status: 'ready', members: [member('ada'), member('bo')] }

function rows(state: MembersState, overrides: { canManage?: boolean; query?: string } = {}) {
  return memberScreenRows({
    state,
    directory,
    canManage: overrides.canManage ?? true,
    query: overrides.query ?? '',
    memberName: (m) => memberDisplayName(m),
    userName: userDisplayName,
  }).map((row) => (row.kind === 'member' ? `m:${row.member.id}` : `c:${row.user.id}`))
}

describe('memberScreenRows', () => {
  it.each<[string, MembersState, string[]]>([
    // The directory answered first: no Invite on anybody, the spinner stays (CR-01 review).
    ['members still loading', { status: 'loading' }, []],
    // The members failed: nothing covers the failure notice.
    ['members failed', { status: 'failed', title: 'Offline', hint: 'Try again' }, []],
    ['members ready', ready, ['m:ada', 'm:bo', 'c:cy']],
  ])('with %s', (_label, state, expected) => {
    expect(rows(state)).toEqual(expected)
  })

  it('never offers a current member as a candidate', () => {
    expect(rows(ready)).not.toContain('c:ada')
  })

  it('lists only members for somebody who cannot manage memberships', () => {
    expect(rows(ready, { canManage: false })).toEqual(['m:ada', 'm:bo'])
  })

  it('filters both lists by the query', () => {
    expect(rows(ready, { query: ' B ' })).toEqual(['m:bo'])
    expect(rows(ready, { query: 'cy' })).toEqual(['c:cy'])
  })

  it('searches a nameless member by the name it prints', () => {
    const state: MembersState = { status: 'ready', members: [member('ada', '')] }
    expect(rows(state, { query: 'unnamed', canManage: false })).toEqual(['m:ada'])
  })
})
