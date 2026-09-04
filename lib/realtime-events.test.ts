import {
  createCountedMessages,
  parseConversationDeleted,
  parseConversationUpdated,
  parseMessageCreated,
  REALTIME_EVENTS,
  REALTIME_NAMESPACE,
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

/**
 * What an Agent's socket received for the same conversation: every message
 * carries a named `sender`, including the Customer's own.
 */
const STAFF_MESSAGE_CREATED = {
  conversationId: '6f74c64f-445b-40fd-b264-e2adcbd77619',
  message: {
    id: '94fe7794-f129-4bee-884b-d4db44408aca',
    body: 'fixture probe',
    messageType: 'text',
    createdAt: '2026-09-04T06:41:37.958Z',
    sender: { id: '0d943b47-fba8-4162-8dc3-cf260544c251', name: 'QA Customer', role: 'customer' },
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
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

describe('the namespace and event names', () => {
  it('are the API’s own', () => {
    expect(REALTIME_NAMESPACE).toBe('/realtime')
    expect(REALTIME_EVENTS).toEqual({
      messageCreated: 'message.created',
      conversationUpdated: 'conversation.updated',
      conversationDeleted: 'conversation.deleted',
      conversationJoin: 'conversation.join',
      conversationLeave: 'conversation.leave',
    })
  })
})

describe('parseMessageCreated', () => {
  it('reads the conversation id beside the message', () => {
    const event = parseMessageCreated(MESSAGE_CREATED)

    expect(event?.conversationId).toBe('6f74c64f-445b-40fd-b264-e2adcbd77619')
    expect(event?.message).toEqual({
      id: 'e78e9aef-c0e1-4243-b81a-e299f06e89ba',
      body: 'fixture probe',
      messageType: 'text',
      createdAt: '2026-09-03T20:22:05.789Z',
      fromCompany: true,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
    })
  })

  it('reads what an Agent is sent: a named sender on the Customer’s own message', () => {
    const event = parseMessageCreated(STAFF_MESSAGE_CREATED)

    expect(event?.conversationId).toBe('6f74c64f-445b-40fd-b264-e2adcbd77619')
    expect(event?.message).toMatchObject({
      id: '94fe7794-f129-4bee-884b-d4db44408aca',
      messageType: 'text',
      sender: { id: '0d943b47-fba8-4162-8dc3-cf260544c251', name: 'QA Customer', role: 'customer' },
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

  it('reads a staff-shaped message, which is what a group sends a Customer', () => {
    const event = parseMessageCreated({
      conversationId: 'group-1',
      message: {
        ...MESSAGE_CREATED.message,
        fromCompany: undefined,
        sender: { id: 'agent-1', name: 'Rae', role: 'agent' },
      },
    })

    expect(event?.message).toMatchObject({
      sender: { id: 'agent-1', name: 'Rae', role: 'agent' },
    })
  })

  const refused: [string, unknown][] = [
    ['null', null],
    ['a string', 'message.created'],
    ['no conversation id', { message: MESSAGE_CREATED.message }],
    ['an empty conversation id', { conversationId: '', message: MESSAGE_CREATED.message }],
    ['no message', { conversationId: 'c1' }],
    ['a message with no id', { conversationId: 'c1', message: { createdAt: '2026-09-03T20:22:05.789Z' } }],
    ['a message with no timestamp', { conversationId: 'c1', message: { id: 'm1' } }],
    [
      'a message whose timestamp is not a time',
      { conversationId: 'c1', message: { id: 'm1', createdAt: 'whenever' } },
    ],
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
      type: 'support_dm',
      lastMessageAt: '2026-09-03T20:22:05.730Z',
      lastMessagePreview: 'fixture probe',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount: null,
    })
  })

  it('keeps the API’s uncounted unread rather than inventing a zero', () => {
    expect(parseConversationUpdated(CONVERSATION_UPDATED)?.unreadCount).toBeNull()
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
    ['null', null],
    ['an empty envelope', {}],
    ['a row with no id', { conversation: { organizationId: 'o1', type: 'support_dm' } }],
    ['a row with no organization', { conversation: { id: 'c1', type: 'support_dm' } }],
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

  const refused: [string, unknown][] = [
    ['null', null],
    ['an empty envelope', {}],
    ['an empty id', { conversationId: '' }],
    ['a non-string id', { conversationId: 7 }],
  ]

  it.each(refused)('answers null for %s', (_case, payload) => {
    expect(parseConversationDeleted(payload)).toBeNull()
  })
})

describe('createCountedMessages', () => {
  it('counts an id once, and never again', () => {
    const counted = createCountedMessages()

    expect(counted.isFirst('m1')).toBe(true)
    expect(counted.isFirst('m1')).toBe(false)
    expect(counted.isFirst('m1')).toBe(false)
  })

  it('counts one message once however many times its receipt advances', () => {
    const counted = createCountedMessages()
    // What the API broadcasts for two messages, the first of which was
    // delivered and then read while the list was open.
    const broadcasts = ['m1', 'm1', 'm1', 'm2', 'm2']

    expect(broadcasts.filter((id) => counted.isFirst(id))).toEqual(['m1', 'm2'])
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

  it('does not remember an id twice, so a repeat cannot fill the memory', () => {
    const counted = createCountedMessages(2)

    counted.isFirst('m1')
    counted.isFirst('m1')
    counted.isFirst('m2')

    expect(counted.isFirst('m1')).toBe(false)
    expect(counted.isFirst('m2')).toBe(false)
  })
})
