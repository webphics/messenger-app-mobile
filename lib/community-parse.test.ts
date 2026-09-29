import {
  parseCommunities,
  parseCommunity,
  parseCommunityFeedRow,
  parseGroupJoinOutcome,
} from '@/lib/community-parse'

/** A minimal row `parseConversation` can read — shape borrowed from `conversation-parse.test.ts`. */
function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    organizationId: 'org-1',
    type: 'group',
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 0,
    ...overrides,
  }
}

const community = {
  id: 'community-1',
  name: 'Acme Community',
  isModerator: true,
  description: 'Everyone at Acme',
  avatarUrl: '/uploads/acme.png',
  memberCount: 3,
  linkedGroups: [
    { id: 'group-1', title: 'Releases', avatarUrl: null, memberCount: 2 },
    { id: 'group-2', title: 'Support', avatarUrl: null, memberCount: 3 },
  ],
  createdAt: '2026-09-01T10:00:00.000Z',
  members: [
    { id: 'user-1', name: 'Ada', role: 'customer', isModerator: false },
    { id: 'user-2', name: 'Grace', role: 'admin', isModerator: true },
  ],
}

describe('parseCommunity', () => {
  it('reads a Community down to the membership it is narrowed by', () => {
    expect(parseCommunity(community)).toEqual({
      id: 'community-1',
      name: 'Acme Community',
      description: 'Everyone at Acme',
      avatarUrl: '/uploads/acme.png',
      memberCount: 3,
      linkedGroupCount: 2,
      memberIds: ['user-1', 'user-2'],
      createdAt: '2026-09-01T10:00:00.000Z',
    })
  })

  // A membership this client cannot read would empty the tab and then the Store.
  it.each(['id', 'members'])('refuses a Community with no %s, because the alternative is inventing one', field => {
    expect(parseCommunity({ ...community, [field]: undefined })).toBeNull()
  })
})

describe('parseCommunities', () => {
  it('drops a row it cannot read rather than the page', () => {
    expect(parseCommunities([community, { name: 'nameless' }])).toHaveLength(1)
  })

  it('refuses a page it could read none of, which is not the same as belonging to none', () => {
    expect(parseCommunities([{ name: 'nameless' }, { name: 'also nameless' }])).toBeNull()
    expect(parseCommunities([])).toEqual([])
  })
})

describe('parseCommunityFeedRow', () => {
  it('reads a Group the viewer is in, with everything a conversation row draws', () => {
    expect(
      parseCommunityFeedRow({
        id: 'group-1',
        type: 'group',
        membership: 'member',
        title: 'Releases',
        avatarUrl: null,
        lastMessageAt: '2026-09-14T08:00:00.000Z',
        lastMessagePreview: 'Shipping Friday',
        unreadCount: 4,
        muted: true,
        joinPolicy: 'open',
        joinState: 'member',
      }),
    ).toEqual({
      kind: 'member_group',
      id: 'group-1',
      title: 'Releases',
      avatarUrl: null,
      lastMessageAt: '2026-09-14T08:00:00.000Z',
      lastMessagePreview: 'Shipping Friday',
      unreadCount: 4,
      muted: true,
      joinPolicy: 'open',
    })
  })

  it('reads a Group the viewer is not in, and invents no unread count for it', () => {
    const row = parseCommunityFeedRow({
      id: 'group-2',
      type: 'group',
      membership: 'non_member',
      title: 'Support',
      avatarUrl: null,
      memberCount: 9,
      joinPolicy: 'request',
      joinState: 'pending',
    })

    expect(row).toMatchObject({ kind: 'joinable_group', joinState: 'pending' })
    expect(row).not.toHaveProperty('unreadCount')
  })

  it.each([
    ['a shape it has never heard of', { id: 'x', type: 'channel', title: 'X' }],
    ['a membership it cannot place', { id: 'x', type: 'group', membership: 'maybe', title: 'X' }],
  ])('refuses %s', (_name, row) => {
    expect(parseCommunityFeedRow(row)).toBeNull()
  })

  it('falls back to the stricter policy when the API sent one this build cannot read', () => {
    const row = parseCommunityFeedRow({
      id: 'group-4',
      type: 'group',
      membership: 'non_member',
      title: 'Odd',
      memberCount: 0,
      joinPolicy: 'invite-only',
      joinState: 'may_request',
    })
    expect(row).toMatchObject({ joinPolicy: 'request' })
  })
})

describe('parseGroupJoinOutcome', () => {
  it('reads a join straight through, conversation and all, and a request as one with nothing to carry', () => {
    expect(parseGroupJoinOutcome({ outcome: 'joined', conversation: conversationRow() })).toEqual({
      outcome: 'joined',
      conversation: expect.objectContaining({ id: 'group-1', type: 'group' }),
    })
    expect(parseGroupJoinOutcome({ outcome: 'requested', request: { id: 'req-1' } })).toEqual({
      outcome: 'requested',
    })
  })

  it('refuses a joined outcome whose conversation this build cannot read', () => {
    expect(parseGroupJoinOutcome({ outcome: 'joined', conversation: {} })).toBeNull()
  })
})
