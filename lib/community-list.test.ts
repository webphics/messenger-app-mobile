import {
  communityScreenRows,
  communitySections,
  communityTabRows,
  communityThreads,
  feedAfterRead,
  MAX_INLINE_GROUPS,
  myCommunities,
  sortCommunities,
  withLiveThread,
  type CommunityFeed,
} from '@/lib/community-list'
import type {
  Community,
  CommunityFeedRow,
  CommunityJoinableGroupRow,
  CommunityMemberGroupRow,
  Conversation,
} from '@/lib/types'

function community(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-1',
    name: 'Acme',
    description: null,
    avatarUrl: null,
    memberCount: 2,
    linkedGroupCount: 1,
    memberIds: ['viewer'],
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

function group(overrides: Partial<CommunityMemberGroupRow> = {}): CommunityMemberGroupRow {
  return {
    kind: 'member_group',
    id: 'group-1',
    title: 'Releases',
    avatarUrl: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
    muted: false,
    joinPolicy: 'request',
    ...overrides,
  }
}

const announcements: CommunityFeedRow = {
  kind: 'announcements',
  id: 'announcements-1',
  title: 'Announcements',
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
}

function joinableGroup(overrides: Partial<CommunityJoinableGroupRow> = {}): CommunityJoinableGroupRow {
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

const joinable: CommunityFeedRow = joinableGroup()

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'group-1',
    organizationId: 'org-1',
    type: 'group',
    title: 'Releases',
    description: null,
    avatarUrl: null,
    members: [],
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: null,
    ...overrides,
  } as Conversation
}

describe('myCommunities', () => {
  it('keeps the Communities the viewer is in', () => {
    const mine = community({ id: 'mine', memberIds: ['viewer', 'other'] })
    const theirs = community({ id: 'theirs', name: 'Beta', memberIds: ['other'] })

    expect(myCommunities([mine, theirs], 'viewer').map((row) => row.id)).toEqual(['mine'])
  })

  /**
   * Membership and the rooms a person holds are set separately, so an Admin can be given a
   * Community's Announcements thread without being a member of it. Narrowing that Community away
   * took its rooms off both tabs and left the threads reachable from nowhere.
   */
  it('keeps a Community holding a room the viewer can open, with no membership', () => {
    const notAMember = community({ id: 'held', name: 'Held', memberIds: ['someone else'] })
    const stranger = community({ id: 'stranger', name: 'Stranger', memberIds: ['someone else'] })
    const room = conversation({ id: 'room-1', communityId: 'held' })

    expect(myCommunities([notAMember, stranger], 'viewer', [room]).map((row) => row.id)).toEqual([
      'held',
    ])
  })
  it('lists every Community for an Admin, member or not, sorted by name', () => {
    const beta = community({ id: 'b', name: 'Beta', memberIds: ['someone else'] })
    const alpha = community({ id: 'a', name: 'Alpha', memberIds: [] })

    expect(myCommunities([beta, alpha], 'viewer', [], true).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('still lists nothing for nobody signed in, Admin or not', () => {
    expect(myCommunities([community({ id: 'a' })], null, [], true)).toEqual([])
  })
})

describe('sortCommunities', () => {
  it('orders by name, then by id, so a Restored list and a fetched one agree', () => {
    const rows = [
      community({ id: 'z', name: 'Beta' }),
      community({ id: 'b', name: 'Acme' }),
      community({ id: 'a', name: 'Acme' }),
    ]

    expect(sortCommunities(rows).map((row) => row.id)).toEqual(['a', 'b', 'z'])
  })
})

describe('communityThreads', () => {
  it('pins Announcements and orders the Groups newest first', () => {
    const older = group({ id: 'older', title: 'Older', lastMessageAt: '2026-09-10T10:00:00.000Z' })
    const newer = group({ id: 'newer', title: 'Newer', lastMessageAt: '2026-09-14T10:00:00.000Z' })

    const { announcements: pinned, groups } = communityThreads([older, newer, announcements])
    expect(pinned?.id).toBe('announcements-1')
    expect(groups.map((row) => row.id)).toEqual(['newer', 'older'])
  })

  it('drops the Groups the viewer is not in — those have no thread to open', () => {
    expect(communityThreads([joinable, announcements]).groups).toEqual([])
  })
})

describe('withLiveThread', () => {
  it('takes the preview, the time and the count off the live Conversation row', () => {
    const row = group({ unreadCount: 0, lastMessagePreview: 'stale' })
    const live = conversation({
      lastMessageAt: '2026-09-14T12:00:00.000Z',
      lastMessagePreview: 'Shipping Friday',
      unreadCount: 3,
    })

    expect(withLiveThread(row, [live])).toMatchObject({
      lastMessagePreview: 'Shipping Friday',
      lastMessageAt: '2026-09-14T12:00:00.000Z',
      unreadCount: 3,
    })
  })

  it('keeps muted, which the Conversation list does not carry', () => {
    const row = group({ muted: true })
    expect(withLiveThread(row, [conversation()])).toMatchObject({ muted: true })
  })

  it('keeps the count the feed gave when the list declines to count', () => {
    const row = group({ unreadCount: 2 })
    expect(withLiveThread(row, [conversation({ unreadCount: null })])).toMatchObject({
      unreadCount: 2,
    })
  })
})

describe('feedAfterRead', () => {
  const rows = [announcements]

  it('takes the rooms the API answered with', () => {
    expect(feedAfterRead({ ok: true, value: rows }, null)).toEqual({ status: 'ready', rows })
  })

  it('leaves rooms that are already drawn where they are, because they are still true', () => {
    const drawn: CommunityFeed = { status: 'ready', rows }
    expect(feedAfterRead({ ok: false, failure: { kind: 'unreachable' } }, drawn)).toBe(drawn)
  })

  it('is a failure over a Community with nothing drawn, which is somebody at a dead end', () => {
    expect(feedAfterRead({ ok: false, failure: { kind: 'unreachable' } }, null).status).toBe('failed')
  })
})

describe('communityTabRows', () => {
  const ready = (rows: CommunityFeedRow[]): CommunityFeed => ({ status: 'ready', rows })

  it('opens an expanded one onto Announcements, its Groups and View all', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([['community-1', ready([announcements, group()])]]),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community', 'thread', 'thread', 'view-all'])
  })

  it('bounds the Groups drawn inline, however many the viewer is in', () => {
    const many = Array.from({ length: MAX_INLINE_GROUPS + 4 }, (_, index) =>
      group({ id: `group-${index}`, title: `Group ${index}` }),
    )

    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([['community-1', ready(many)]]),
      conversations: [],
    })

    expect(rows.filter((row) => row.kind === 'thread')).toHaveLength(MAX_INLINE_GROUPS)
  })

  it('offers View all even where the feed failed, so a failure is not a dead end', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([
        ['community-1', { status: 'failed', title: 'No groups', hint: 'Try again.' }],
      ]),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community', 'feed-failed', 'view-all'])
  })

  it('keys every row uniquely, so several expanded Communities cannot collide', () => {
    const rows = communityTabRows({
      communities: [community({ id: 'a', name: 'A' }), community({ id: 'b', name: 'B' })],
      expanded: new Set(['a', 'b']),
      feeds: new Map([
        ['a', ready([announcements, group()])],
        ['b', ready([announcements, group()])],
      ]),
      conversations: [],
    })

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})

describe('communitySections', () => {
  it('splits a feed into the pinned thread and the two named sections', () => {
    const sections = communitySections([announcements, group(), joinable])

    expect(sections.announcements?.id).toBe('announcements-1')
    expect(sections.joined.map((row) => row.id)).toEqual(['group-1'])
    expect(sections.joinable.map((row) => row.id)).toEqual(['group-9'])
  })
})

describe('communityScreenRows', () => {
  it('draws the pinned thread first, then both sections in order', () => {
    const rows = communityScreenRows(communitySections([announcements, group(), joinable]))

    expect(rows.map((row) => row.kind)).toEqual([
      'announcements',
      'section',
      'thread',
      'section',
      'joinable',
    ])
  })

  it('keys every row uniquely', () => {
    const rows = communityScreenRows(communitySections([announcements, group(), joinable]))
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})
