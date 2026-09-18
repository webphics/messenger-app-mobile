import {
  communityConversations,
  inboxConversations,
  isCommunityConversation,
} from '@/lib/conversation-scope'
import { communitiesTabBadge, inboxTabBadge } from '@/lib/tab-badges'
import type { Conversation } from '@/lib/types'

/**
 * The split between the inbox and the Communities tab, and the two counts above
 * them.
 *
 * The rule under test is that `communityId` decides it and type does not — which
 * is the whole of why the field was added to the conversation payload. A
 * Community's rooms and an ordinary group chat are both `group`; a Community's
 * Announcements and the personal Announcements thread are both
 * `broadcast_inbox`. Reading either pair by type puts a colleague's group chat
 * inside a Community, or a Community's rooms in the inbox.
 */
function row(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    communityId: null,
    type: 'group',
    title: 'QA Group',
    description: null,
    avatarUrl: null,
    members: [],
    writePolicy: 'everyone',
    canWrite: true,
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    ...overrides,
  } as Conversation
}

describe('isCommunityConversation', () => {
  test.each([
    ["a Community's group", { type: 'group', communityId: 'community-1' }, true],
    ['an ordinary group chat', { type: 'group', communityId: null }, false],
    [
      "a Community's announcements",
      { type: 'broadcast_inbox', communityId: 'community-1' },
      true,
    ],
    [
      'the personal announcements thread',
      { type: 'broadcast_inbox', communityId: null },
      false,
    ],
    ['a support thread', { type: 'support_dm', communityId: null }, false],
  ])('%s', (_case, overrides, expected) => {
    expect(isCommunityConversation(row(overrides as Partial<Conversation>))).toBe(expected)
  })

  /**
   * A payload with no `communityId` at all — every fixture that predates the
   * field, and any build talking to an older API. It belongs to no Community,
   * which leaves it in the inbox where it is visible rather than hiding it
   * inside a Community that cannot be named.
   */
  test('a row that carries no communityId belongs to no Community', () => {
    const legacy = row()
    delete (legacy as { communityId?: string | null }).communityId

    expect(isCommunityConversation(legacy)).toBe(false)
  })

  test('an empty communityId is not a Community', () => {
    expect(isCommunityConversation(row({ communityId: '' }))).toBe(false)
  })
})

describe('the two surfaces', () => {
  const list: Conversation[] = [
    row({ id: 'support', type: 'support_dm', communityId: null }),
    row({ id: 'group-chat', communityId: null }),
    row({ id: 'community-room', communityId: 'community-1' }),
    row({ id: 'community-news', type: 'broadcast_inbox', communityId: 'community-1' }),
    row({ id: 'my-news', type: 'broadcast_inbox', communityId: null }),
  ]

  test('the inbox keeps everything that is not a Community’s', () => {
    expect(inboxConversations(list).map((each) => each.id)).toEqual([
      'support',
      'group-chat',
      'my-news',
    ])
  })

  test('Communities keeps every room a Community owns', () => {
    expect(communityConversations(list).map((each) => each.id)).toEqual([
      'community-room',
      'community-news',
    ])
  })

  /**
   * The property the split exists for: every thread is on exactly one surface.
   * A thread on neither is one nobody can reach, and a thread on both is the
   * bleed this replaced.
   */
  test('every conversation lands on exactly one of them', () => {
    const inbox = inboxConversations(list).map((each) => each.id)
    const communities = communityConversations(list).map((each) => each.id)

    expect([...inbox, ...communities].sort()).toEqual(list.map((each) => each.id).sort())
    expect(inbox.filter((id) => communities.includes(id))).toEqual([])
  })
})

describe('the badges above them', () => {
  const list: Conversation[] = [
    row({ id: 'support', type: 'support_dm', communityId: null, unreadCount: 2 }),
    row({ id: 'community-room', communityId: 'community-1', unreadCount: 3 }),
    row({ id: 'community-news', type: 'broadcast_inbox', communityId: 'community-1', unreadCount: 5 }),
  ]

  test('each counts only what the tab under it draws', () => {
    expect(inboxTabBadge(list)).toBe(2)
    expect(communitiesTabBadge(list)).toBe(8)
  })

  /**
   * The disagreement that prompted the split: the inbox badge counted every
   * unread thread, Community rooms included, while the tab it sat on showed
   * none of them — so a room going unread was announced by the tab that did not
   * contain it, and opening that tab found nothing new.
   */
  test('the inbox badge no longer counts a Community’s rooms', () => {
    const communityOnly = [row({ communityId: 'community-1', unreadCount: 4 })]

    expect(inboxTabBadge(communityOnly)).toBeUndefined()
    expect(communitiesTabBadge(communityOnly)).toBe(4)
  })

  test('neither shows a zero', () => {
    const read = [row({ communityId: 'community-1' }), row({ id: 'b', communityId: null })]

    expect(inboxTabBadge(read)).toBeUndefined()
    expect(communitiesTabBadge(read)).toBeUndefined()
  })
})
