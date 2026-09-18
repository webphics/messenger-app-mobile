import {
  communityScreenRows,
  communitySections,
  communityTabRows,
  communityThreads,
  feedAfterRead,
  JOINABLE_SECTION_TITLE,
  JOINED_SECTION_TITLE,
  MAX_INLINE_GROUPS,
  myCommunities,
  sortCommunities,
  withLiveSections,
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

  it('makes an Admin whole answer invisible where they never joined, rather than refused', () => {
    const everything = [
      community({ id: 'a', name: 'A', memberIds: ['someone'] }),
      community({ id: 'b', name: 'B', memberIds: ['else'] }),
    ]

    expect(myCommunities(everything, 'admin')).toEqual([])
  })

  it('has nothing to show nobody', () => {
    expect(myCommunities([community()], null)).toEqual([])
  })

  /**
   * The case that made this take a third argument, and the one no unit test
   * would have thought to write: membership and the rooms a person holds are
   * set separately, so an Admin can be given a Community's Announcements thread
   * and its Groups without being a member of the Community.
   *
   * It cost nothing while Chats showed every conversation — the rooms were
   * readable there. Once Chats held only what is not a Community's, a Community
   * narrowed away here took its rooms off both tabs and the threads were
   * reachable from nowhere at all. Sixteen of one account's thirty-six, found by
   * opening the screen.
   */
  it("keeps a Community holding a room the viewer can open, with no membership", () => {
    const notAMember = community({ id: 'held', name: 'Held', memberIds: ['someone else'] })
    const stranger = community({ id: 'stranger', name: 'Stranger', memberIds: ['someone else'] })
    const room = conversation({ id: 'room-1', communityId: 'held' })

    expect(myCommunities([notAMember, stranger], 'viewer', [room]).map((row) => row.id)).toEqual([
      'held',
    ])
  })

  it('counts a membership and a held room once, not twice', () => {
    const both = community({ id: 'both', memberIds: ['viewer'] })
    const room = conversation({ id: 'room-1', communityId: 'both' })

    expect(myCommunities([both], 'viewer', [room]).map((row) => row.id)).toEqual(['both'])
  })

  it('is not widened by a conversation belonging to no Community', () => {
    const stranger = community({ id: 'stranger', memberIds: ['someone else'] })
    const plainChat = conversation({ id: 'chat-1', communityId: null })

    expect(myCommunities([stranger], 'viewer', [plainChat])).toEqual([])
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

  it('leaves the list it was given alone', () => {
    const rows = [community({ id: 'z', name: 'Beta' }), community({ id: 'a', name: 'Acme' })]
    sortCommunities(rows)
    expect(rows[0].id).toBe('z')
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

  it('puts a Group nobody has written in last, and breaks a tie by name', () => {
    const quietB = group({ id: 'b', title: 'B' })
    const quietA = group({ id: 'a', title: 'A' })
    const loud = group({ id: 'loud', title: 'Loud', lastMessageAt: '2026-09-14T10:00:00.000Z' })

    expect(communityThreads([quietB, quietA, loud]).groups.map((row) => row.id)).toEqual([
      'loud',
      'a',
      'b',
    ])
  })

  it('drops the Groups the viewer is not in — those have no thread to open', () => {
    expect(communityThreads([joinable, announcements]).groups).toEqual([])
  })

  it('still finds Announcements in a Community holding nothing else the viewer is in', () => {
    expect(communityThreads([announcements, joinable]).announcements?.id).toBe('announcements-1')
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

  it('leaves a thread the Conversation list has never held exactly as it was', () => {
    const row = group({ id: 'unheld' })
    expect(withLiveThread(row, [conversation()])).toBe(row)
  })

  it('gives the Announcements thread the count the feed has no field for', () => {
    const live = conversation({ id: 'announcements-1', unreadCount: 7 })
    expect(withLiveThread(announcements, [live])).toMatchObject({ unreadCount: 7 })
  })

  it('answers with the same row when the live copy says what it already said', () => {
    const row = group({ unreadCount: 3, lastMessagePreview: 'Shipping Friday' })
    const live = conversation({ unreadCount: 3, lastMessagePreview: 'Shipping Friday' })

    // Identity, not equality: every drawn row is re-read whenever a socket event
    // moves anything, and a new object each time would defeat `memo` on the row.
    expect(withLiveThread(row, [live])).toBe(row)
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
    expect(feedAfterRead({ ok: false, failure: { kind: 'unreachable' } }, null)).toEqual({
      status: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  it('titles a refusal for the rooms rather than for the conversation list', () => {
    expect(
      feedAfterRead({ ok: false, failure: { kind: 'refused', message: 'Nope.' } }, null),
    ).toEqual({ status: 'failed', title: 'Could not load groups', hint: 'Nope.' })
  })

  it('does not treat a feed that arrived empty as one worth keeping', () => {
    const drawn: CommunityFeed = { status: 'ready', rows: [] }
    expect(feedAfterRead({ ok: false, failure: { kind: 'unreachable' } }, drawn)).toMatchObject({
      status: 'failed',
    })
  })
})

describe('communityTabRows', () => {
  const ready = (rows: CommunityFeedRow[]): CommunityFeed => ({ status: 'ready', rows })

  it('draws a collapsed Community as one row', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(),
      feeds: new Map(),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community'])
  })

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

  it('shows Announcements for a Community holding no Groups the viewer is in', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([['community-1', ready([announcements, joinable])]]),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community', 'thread', 'view-all'])
  })

  it('says a Community has nothing the viewer can open rather than drawing nothing', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([['community-1', ready([joinable])]]),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community', 'feed-empty', 'view-all'])
  })

  it('treats a feed nobody has asked for yet as one that is loading', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map(),
      conversations: [],
    })

    expect(rows.map((row) => row.kind)).toEqual(['community', 'feed-loading', 'view-all'])
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

  it('draws each thread with what the Conversation list knows about it', () => {
    const rows = communityTabRows({
      communities: [community()],
      expanded: new Set(['community-1']),
      feeds: new Map([['community-1', ready([group()])]]),
      conversations: [conversation({ unreadCount: 5, lastMessagePreview: 'Live' })],
    })

    expect(rows.find((row) => row.kind === 'thread')).toMatchObject({
      row: { unreadCount: 5, lastMessagePreview: 'Live' },
    })
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

  it('orders the Groups somebody may join alphabetically, since none of them have activity to rank by', () => {
    const b = joinableGroup({ id: 'b', title: 'Beta' })
    const a = joinableGroup({ id: 'a', title: 'Alpha' })

    expect(communitySections([b, a]).joinable.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('has nothing joinable in a Community the viewer is already everywhere in', () => {
    expect(communitySections([announcements, group()]).joinable).toEqual([])
  })
})

describe('withLiveSections', () => {
  it('overlays the live Conversation onto the pinned thread and every joined Group', () => {
    const sections = communitySections([announcements, group()])
    const live = conversation({ unreadCount: 5, lastMessagePreview: 'Live' })

    const next = withLiveSections(sections, [live])
    expect(next.joined[0]).toMatchObject({ unreadCount: 5, lastMessagePreview: 'Live' })
  })

  it('leaves the Groups somebody may join untouched — there is no thread to overlay', () => {
    const sections = communitySections([joinable])
    expect(withLiveSections(sections, [conversation()]).joinable).toEqual(sections.joinable)
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

  it('names both sections even when neither is empty', () => {
    const rows = communityScreenRows(communitySections([group(), joinable]))
    const titles = rows.filter((row) => row.kind === 'section').map((row) => row.title)

    expect(titles).toEqual([JOINED_SECTION_TITLE, JOINABLE_SECTION_TITLE])
  })

  it('says a section is empty rather than collapsing it away', () => {
    const rows = communityScreenRows(communitySections([joinable]))

    expect(rows.map((row) => row.kind)).toEqual(['section', 'joined-empty', 'section', 'joinable'])
  })

  it('says both sections are empty for a Community with no Groups at all', () => {
    const rows = communityScreenRows(communitySections([]))

    expect(rows.map((row) => row.kind)).toEqual([
      'section',
      'joined-empty',
      'section',
      'joinable-empty',
    ])
  })

  it('keys every row uniquely', () => {
    const rows = communityScreenRows(communitySections([announcements, group(), joinable]))
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})
