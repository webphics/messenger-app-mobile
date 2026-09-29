import { communityActionRefusal, joinRowAction } from '@/lib/community-join'
import type { CommunityJoinableGroupRow } from '@/lib/types'

function row(overrides: Partial<CommunityJoinableGroupRow> = {}): CommunityJoinableGroupRow {
  return {
    kind: 'joinable_group',
    id: 'group-9',
    title: 'Support',
    avatarUrl: null,
    memberCount: 4,
    joinPolicy: 'open',
    joinState: 'may_request',
    ...overrides,
  }
}

describe('joinRowAction', () => {
  it('offers to withdraw once a request is pending, whatever the policy now reads (#88)', () => {
    expect(joinRowAction(row({ joinPolicy: 'open', joinState: 'pending' }))).toBe('withdraw')
    expect(joinRowAction(row({ joinState: 'may_request' }))).toBe('join')
  })
})

describe('communityActionRefusal', () => {
  it('says nothing for an expired session — the auth layer is already leaving', () => {
    expect(communityActionRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})
