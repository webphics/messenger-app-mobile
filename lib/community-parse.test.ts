import {
  isCommunityThreadRow,
  parseCommunities,
  parseCommunity,
  parseCommunityFeed,
  parseCommunityFeedRow,
} from '@/lib/community-parse'

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

  it.each(['id', 'name', 'createdAt', 'members'])(
    'refuses a Community with no %s, because the alternative is inventing one',
    field => {
      expect(parseCommunity({ ...community, [field]: undefined })).toBeNull()
    },
  )

  it('reads an empty member list as one, which is a Community nobody is left in', () => {
    expect(parseCommunity({ ...community, members: [] })?.memberIds).toEqual([])
  })

  it('refuses a Community with no member list, rather than reading it as one nobody is in', () => {
    // The tab is narrowed by this, and the narrowing is written through: a
    // membership this client cannot read would empty the tab and then the Store.
    expect(parseCommunity({ ...community, members: undefined })).toBeNull()
  })

  it('leaves administering on web: nothing about running a Community is carried', () => {
    const parsed = parseCommunity(community)
    expect(parsed).not.toHaveProperty('isModerator')
    expect(parsed).not.toHaveProperty('members')
  })

  it('counts nothing it cannot read', () => {
    expect(parseCommunity({ ...community, memberCount: 'three' })?.memberCount).toBe(0)
  })
})

describe('parseCommunities', () => {
  it('drops a row it cannot read rather than the page', () => {
    expect(parseCommunities([community, { name: 'nameless' }])).toHaveLength(1)
  })

  it('refuses a payload that is not a list at all', () => {
    expect(parseCommunities({ communities: [] })).toBeNull()
  })

  it('reads an empty page as an empty page — somebody may belong to nothing', () => {
    expect(parseCommunities([])).toEqual([])
  })

  it('refuses a page it could read none of, which is not the same as belonging to none', () => {
    expect(parseCommunities([{ name: 'nameless' }, { name: 'also nameless' }])).toBeNull()
  })
})

describe('parseCommunityFeedRow', () => {
  it('reads the Announcements thread', () => {
    expect(
      parseCommunityFeedRow({
        id: 'thread-1',
        type: 'announcements',
        pinned: true,
        title: 'Announcements',
        lastMessageAt: '2026-09-14T09:00:00.000Z',
        lastMessagePreview: 'The lift is fixed.',
      }),
    ).toEqual({
      kind: 'announcements',
      id: 'thread-1',
      title: 'Announcements',
      lastMessageAt: '2026-09-14T09:00:00.000Z',
      lastMessagePreview: 'The lift is fixed.',
      // Not on the wire. The Conversation list is where it comes from.
      unreadCount: 0,
    })
  })

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

    expect(row).toEqual({
      kind: 'joinable_group',
      id: 'group-2',
      title: 'Support',
      avatarUrl: null,
      memberCount: 9,
      joinPolicy: 'request',
      joinState: 'pending',
    })
    expect(row).not.toHaveProperty('unreadCount')
  })

  it('takes a pending ask off the row rather than deriving it from the policy', () => {
    const open = parseCommunityFeedRow({
      id: 'group-3',
      type: 'group',
      membership: 'non_member',
      title: 'Open',
      memberCount: 1,
      joinPolicy: 'open',
      joinState: 'may_request',
    })
    expect(open).toMatchObject({ joinPolicy: 'open', joinState: 'may_request' })
  })

  it.each([
    ['a shape it has never heard of', { id: 'x', type: 'channel', title: 'X' }],
    ['a membership it cannot place', { id: 'x', type: 'group', membership: 'maybe', title: 'X' }],
    ['a row with no title', { id: 'x', type: 'announcements' }],
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

describe('parseCommunityFeed', () => {
  it('drops a row it cannot read rather than the feed', () => {
    expect(
      parseCommunityFeed([
        { id: 'thread-1', type: 'announcements', title: 'Announcements' },
        { id: 'nope', type: 'channel', title: 'Nope' },
      ]),
    ).toHaveLength(1)
  })

  it('refuses a payload that is not a list at all', () => {
    expect(parseCommunityFeed(null)).toBeNull()
  })
})

describe('isCommunityThreadRow', () => {
  it('opens a thread for the rows that have one, and for no others', () => {
    expect(
      isCommunityThreadRow({
        kind: 'announcements',
        id: 'a',
        title: 'Announcements',
        lastMessageAt: null,
        lastMessagePreview: null,
        unreadCount: 0,
      }),
    ).toBe(true)
    expect(
      isCommunityThreadRow({
        kind: 'joinable_group',
        id: 'g',
        title: 'Support',
        avatarUrl: null,
        memberCount: 2,
        joinPolicy: 'open',
        joinState: 'may_request',
      }),
    ).toBe(false)
  })
})
