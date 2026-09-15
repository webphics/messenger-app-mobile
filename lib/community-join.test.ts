import { canRequestJoin, communityActionRefusal, joinButtonLabel } from '@/lib/community-join'
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

describe('joinButtonLabel', () => {
  it('offers Join under an open policy with nothing pending', () => {
    expect(joinButtonLabel(row({ joinPolicy: 'open', joinState: 'may_request' }))).toBe('Join')
  })

  it('offers Ask to join under a request policy with nothing pending', () => {
    expect(joinButtonLabel(row({ joinPolicy: 'request', joinState: 'may_request' }))).toBe(
      'Ask to join',
    )
  })

  it('says Requested for a pending ask, whatever the policy now reads', () => {
    expect(joinButtonLabel(row({ joinPolicy: 'open', joinState: 'pending' }))).toBe('Requested')
    expect(joinButtonLabel(row({ joinPolicy: 'request', joinState: 'pending' }))).toBe('Requested')
  })
})

describe('canRequestJoin', () => {
  it('allows a tap when nothing is pending', () => {
    expect(canRequestJoin(row({ joinState: 'may_request' }))).toBe(true)
  })

  it('offers nothing further once a request is pending', () => {
    expect(canRequestJoin(row({ joinState: 'pending' }))).toBe(false)
  })
})

describe('communityActionRefusal', () => {
  it('carries the server’s own message for a refusal', () => {
    expect(communityActionRefusal({ kind: 'refused', message: 'Already a member.' })).toBe(
      'Already a member.',
    )
  })

  it('names the connection when nothing was reached', () => {
    expect(communityActionRefusal({ kind: 'unreachable' })).toBe('No connection. Try again.')
  })

  it('says nothing for an expired session — the auth layer is already leaving', () => {
    expect(communityActionRefusal({ kind: 'unauthorised' })).toBeNull()
  })

  it('falls back to one sentence for a body it could not read', () => {
    expect(communityActionRefusal({ kind: 'malformed' })).toBe('That could not be sent.')
  })
})
