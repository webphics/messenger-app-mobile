import {
  createCountedMessages,
  parseConversationDeleted,
  parseConversationReassigned,
  parseConversationUpdated,
  parseGroupJoinRequestAnswered,
  parseMessageCreated,
  parseMessageDeleted,
  parsePostCreated,
  parsePostRemoved,
  parsePostUpdated,
} from '@/lib/realtime-events'
import { isStaffConversation } from '@/lib/types'

/**
 * The payloads below are copies of what the running API emitted — to a
 * Customer's socket (a staff reply into a Support DM, the row update that
 * followed it, a deletion) and to an Agent's (the same thread seen from the
 * staff side, plus the Engage notice only Staff are sent). Kept verbatim so a
 * change on the API's side shows up here as a failing test rather than as an
 * empty screen.
 */
const MESSAGE_CREATED = {
  conversationId: '6f74c64f-445b-40fd-b264-e2adcbd77619',
  message: {
    id: 'e78e9aef-c0e1-4243-b81a-e299f06e89ba',
    body: 'fixture probe',
    messageType: 'text',
    createdAt: '2026-09-03T20:22:05.789Z',
    fromCompany: true,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
  },
}

const CONVERSATION_UPDATED = {
  conversation: {
    id: '6f74c64f-445b-40fd-b264-e2adcbd77619',
    organizationId: 'acb16271-ee14-4a52-8952-68113b7a11bc',
    type: 'support_dm',
    lastMessageAt: '2026-09-03T20:22:05.730Z',
    lastMessagePreview: 'fixture probe',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: null,
  },
}

/** The Engage notice, which reaches Staff and no Customer. */
const SYSTEM_NOTICE_CREATED = {
  conversationId: '6f74c64f-445b-40fd-b264-e2adcbd77619',
  message: {
    id: '9e618aa3-a9f0-4d6d-84f9-82a4d2bbd992',
    body: 'QA Agent joined the support chat',
    messageType: 'system',
    createdAt: '2026-09-04T06:41:42.294Z',
    sender: { id: '56e168f0-3b5a-49fb-b475-0063c78a2337', name: 'QA Agent', role: 'agent' },
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
  },
}

/**
 * The row that followed it on the Agent's socket. Carries the assignment detail
 * the unassigned pool filters on, and the same `unreadCount: null` a Customer's
 * row carries — only the list endpoint counts, for either side.
 */
const STAFF_CONVERSATION_UPDATED = {
  conversation: {
    id: '6f74c64f-445b-40fd-b264-e2adcbd77619',
    organizationId: 'acb16271-ee14-4a52-8952-68113b7a11bc',
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: {
      id: '0d943b47-fba8-4162-8dc3-cf260544c251',
      name: 'QA Customer',
      isOnline: false,
      lastOnlineAt: '2026-09-04T06:19:01.960Z',
    },
    assignedAgent: {
      id: '56e168f0-3b5a-49fb-b475-0063c78a2337',
      name: 'QA Agent',
      isOnline: true,
      lastOnlineAt: null,
    },
    otherUser: null,
    members: [],
    lastMessageAt: '2026-09-04T06:41:42.234Z',
    lastMessagePreview: 'QA Agent joined the support chat',
    lastMessageMine: true,
    lastMessageReceiptStatus: 'sent',
    lastMessageRead: true,
    unreadCount: null,
    labels: [],
  },
}

/**
 * What the Agent's socket received the moment the Admin took the thread from
 * them, verbatim. Nothing else received it: the API emits this to the previous
 * assignee's user room alone.
 */
const CONVERSATION_REASSIGNED = {
  conversationId: '6f74c64f-445b-40fd-b264-e2adcbd77619',
  reason: 'taken_over',
  currentAssignee: {
    id: 'ab05cfc4-5ee5-40fb-93af-564a773257e5',
    name: 'Admin',
    role: 'admin',
  },
  engagedStaffCount: 2,
  engagedStaff: [
    { id: 'ab05cfc4-5ee5-40fb-93af-564a773257e5', name: 'Admin', role: 'admin' },
    { id: '56e168f0-3b5a-49fb-b475-0063c78a2337', name: 'QA Agent', role: 'agent' },
  ],
}

describe('parseMessageCreated', () => {
  it('reads the conversation id beside the message', () => {
    const event = parseMessageCreated(MESSAGE_CREATED)

    expect(event?.conversationId).toBe('6f74c64f-445b-40fd-b264-e2adcbd77619')
    expect(event?.message).toEqual({
      id: 'e78e9aef-c0e1-4243-b81a-e299f06e89ba',
      body: 'fixture probe',
      messageType: 'text',
      createdAt: '2026-09-03T20:22:05.789Z',
      editedAt: null,
      editableUntil: null,
      fromCompany: true,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
    })
  })

  it('reads an Engage notice, which only Staff are sent', () => {
    const event = parseMessageCreated(SYSTEM_NOTICE_CREATED)

    expect(event?.message).toMatchObject({
      messageType: 'system',
      body: 'QA Agent joined the support chat',
      sender: { id: '56e168f0-3b5a-49fb-b475-0063c78a2337', name: 'QA Agent', role: 'agent' },
    })
  })

  const refused: [string, unknown][] = [
    ['null', null],
    ['no conversation id', { message: MESSAGE_CREATED.message }],
    ['a message with no id', { conversationId: 'c1', message: { createdAt: '2026-09-03T20:22:05.789Z' } }],
  ]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parseMessageCreated(payload)).toBeNull()
  })
})

describe('parseConversationUpdated', () => {
  it('reads the row the API sends', () => {
    expect(parseConversationUpdated(CONVERSATION_UPDATED)).toEqual({
      id: '6f74c64f-445b-40fd-b264-e2adcbd77619',
      organizationId: 'acb16271-ee14-4a52-8952-68113b7a11bc',
      communityId: null,
      type: 'support_dm',
      lastMessageAt: '2026-09-03T20:22:05.730Z',
      lastMessagePreview: 'fixture probe',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount: null,
      access: { kind: 'unknown' },
    })
  })

  it('reads the staff row, including what the unassigned pool filters on', () => {
    const row = parseConversationUpdated(STAFF_CONVERSATION_UPDATED)

    expect(row).toMatchObject({
      id: '6f74c64f-445b-40fd-b264-e2adcbd77619',
      type: 'support_dm',
      status: 'engaged',
      assignedAgent: { id: '56e168f0-3b5a-49fb-b475-0063c78a2337', name: 'QA Agent' },
      customer: { id: '0d943b47-fba8-4162-8dc3-cf260544c251', name: 'QA Customer' },
      labels: [],
      unreadCount: null,
    })
    expect(row && isStaffConversation(row)).toBe(true)
  })

  const refused: [string, unknown][] = [
    ['a row with no id', { conversation: { organizationId: 'o1', type: 'support_dm' } }],
    ['a row with an unknown type', { conversation: { id: 'c1', organizationId: 'o1', type: 'dm' } }],
  ]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parseConversationUpdated(payload)).toBeNull()
  })
})

describe('parseConversationDeleted', () => {
  it('reads the id', () => {
    expect(parseConversationDeleted({ conversationId: 'c1' })).toBe('c1')
  })

  const refused: [string, unknown][] = [['an empty id', { conversationId: '' }]]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parseConversationDeleted(payload)).toBeNull()
  })
})

describe('parseConversationReassigned', () => {
  test('reads what the running API sent the Agent whose thread was taken', () => {
    expect(parseConversationReassigned(CONVERSATION_REASSIGNED)).toEqual({
      conversationId: '6f74c64f-445b-40fd-b264-e2adcbd77619',
      reason: 'taken_over',
      // The assignee's role and the engaged-staff roll call are dropped: a
      // conversation row names an assignee, and nothing here asks who came before.
      assignee: { id: 'ab05cfc4-5ee5-40fb-93af-564a773257e5', name: 'Admin' },
    })
  })

  test('a revocation names nobody, because the thread went back to the pool', () => {
    expect(
      parseConversationReassigned({
        conversationId: 'conv-1',
        reason: 'membership_revoked',
        currentAssignee: null,
        engagedStaffCount: 0,
        engagedStaff: [],
      }),
    ).toEqual({ conversationId: 'conv-1', reason: 'membership_revoked', assignee: null })
  })

  test.each([
    ['no conversation', { reason: 'taken_over', currentAssignee: null }],
    ['a reason this client does not know', { conversationId: 'conv-1', reason: 'reopened' }],
  ])('answers null for %s', (_case, payload) => {
    expect(parseConversationReassigned(payload)).toBeNull()
  })

  test('an unreadable assignee reads as nobody rather than failing the event', () => {
    expect(
      parseConversationReassigned({
        conversationId: 'conv-1',
        reason: 'taken_over',
        currentAssignee: { name: 'Admin' },
      }),
    ).toEqual({ conversationId: 'conv-1', reason: 'taken_over', assignee: null })
  })
})

/**
 * What `post.created` and `.updated` carry, per `docs/api/conversations.md` →
 * "Realtime: Wall Posts": `{ organizationId, post }`, where `post` is the same
 * shape `POST /wall/posts` answers in `data`.
 */
const POST_CREATED = {
  organizationId: 'acb16271-ee14-4a52-8952-68113b7a11bc',
  post: {
    id: '2e2f0a2b-9e4a-4a3a-9a2e-9f6b3f9c1a10',
    author: { id: '56e168f0-3b5a-49fb-b475-0063c78a2337', name: 'QA Agent' },
    organizationId: 'acb16271-ee14-4a52-8952-68113b7a11bc',
    body: 'fixture probe',
    attachments: [],
    link: null,
    reactions: [],
    editedAt: null,
    createdAt: '2026-09-14T10:00:00.000Z',
  },
}

describe('parsePostCreated / parsePostUpdated', () => {
  it('reads the post envelope carries, unparsed', () => {
    expect(parsePostCreated(POST_CREATED)).toEqual({ post: POST_CREATED.post })
    expect(parsePostUpdated(POST_CREATED)).toEqual({ post: POST_CREATED.post })
  })

  const refused: [string, unknown][] = [
    ['no post', { organizationId: 'org-1' }],
    ['a post that is not an object', { organizationId: 'org-1', post: 'nope' }],
  ]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parsePostCreated(payload)).toBeNull()
    expect(parsePostUpdated(payload)).toBeNull()
  })
})

describe('parsePostRemoved', () => {
  it('reads the id', () => {
    expect(parsePostRemoved({ organizationId: 'org-1', postId: 'post-1' })).toEqual({
      postId: 'post-1',
    })
  })

  const refused: [string, unknown][] = [['an empty id', { organizationId: 'org-1', postId: '' }]]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parsePostRemoved(payload)).toBeNull()
  })
})

describe('parseGroupJoinRequestAnswered', () => {
  it('recognises an approval, and reads the Group it opened off conversationId', () => {
    expect(
      parseGroupJoinRequestAnswered({
        notification: { kind: 'group_join_request_approved', conversationId: 'group-1' },
        unreadCount: 1,
      }),
    ).toEqual({ groupId: 'group-1' })
  })

  it('recognises a decline, which names no Group to open', () => {
    expect(
      parseGroupJoinRequestAnswered({
        notification: { kind: 'group_join_request_declined', conversationId: null },
        unreadCount: 1,
      }),
    ).toEqual({ groupId: null })
  })

  it('ignores the kind meant for whoever may answer a request — that stays off the phone', () => {
    expect(
      parseGroupJoinRequestAnswered({ notification: { kind: 'group_join_requested' } }),
    ).toBeNull()
  })

})

describe('createCountedMessages', () => {
  // The API re-broadcasts a message each time its receipt advances; only the first counts.
  it('counts an id once, and never again', () => {
    const counted = createCountedMessages()

    expect(counted.isFirst('m1')).toBe(true)
    expect(counted.isFirst('m1')).toBe(false)
    expect(counted.isFirst('m1')).toBe(false)
  })

  it('forgets the oldest id rather than growing without limit', () => {
    const counted = createCountedMessages(2)

    expect(counted.isFirst('m1')).toBe(true)
    expect(counted.isFirst('m2')).toBe(true)
    expect(counted.isFirst('m3')).toBe(true)
    // m1 was evicted to make room; m2 and m3 are still remembered.
    expect(counted.isFirst('m2')).toBe(false)
    expect(counted.isFirst('m3')).toBe(false)
    expect(counted.isFirst('m1')).toBe(true)
  })
})

describe('parseConversationUpdated, reading access', () => {
  it('keeps the access the per-viewer event carries', () => {
    const access = {
      write: { state: 'read_only', reason: 'conversation_closed', holder: null, wayOut: 'reopen' },
      actions: { editMessages: false, engage: false, takeOver: false, transfer: false, close: false, reopen: true, setPriority: true, manageLabels: true, readNotes: true, writeNotes: true, setWritePolicy: false, setJoinPolicy: false, deleteMessages: false, deleteConversation: true },
    }
    const payload = { conversation: { ...STAFF_CONVERSATION_UPDATED.conversation, access } }

    expect(parseConversationUpdated(payload)?.access).toEqual(access)
  })
})

describe('parseMessageDeleted', () => {
  it('reads both ids', () => {
    expect(parseMessageDeleted({ conversationId: 'c1', messageId: 'm1' })).toEqual({
      conversationId: 'c1',
      messageId: 'm1',
    })
  })

  const refused: [string, unknown][] = [
    ['no message id', { conversationId: 'c1' }],
    ['an empty conversation id', { conversationId: '', messageId: 'm1' }],
    ['not an object', 'm1'],
  ]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parseMessageDeleted(payload)).toBeNull()
  })
})
