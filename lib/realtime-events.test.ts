import {
  createSeenMessages,
  parseConversationDeleted,
  parseConversationUpdated,
  parseMessageCreated,
  REALTIME_EVENTS,
  REALTIME_NAMESPACE,
} from '@/lib/realtime-events'

/**
 * The payloads below are copies of what the running API emitted to a Customer's
 * socket — a staff reply into a Support DM, the row update that followed it, and
 * a deletion. Kept verbatim so a change on the API's side shows up here as a
 * failing test rather than as an empty screen.
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

describe('createSeenMessages', () => {
  it('is new once, and never again', () => {
    const seen = createSeenMessages()

    expect(seen.isNew('m1')).toBe(true)
    expect(seen.isNew('m1')).toBe(false)
    expect(seen.isNew('m1')).toBe(false)
  })

  it('drops the duplicate the API sends beside the original', () => {
    const seen = createSeenMessages()
    const delivered = ['m1', 'm1', 'm2', 'm2', 'm3']

    expect(delivered.filter((id) => seen.isNew(id))).toEqual(['m1', 'm2', 'm3'])
  })

  it('forgets the oldest id rather than growing without limit', () => {
    const seen = createSeenMessages(2)

    expect(seen.isNew('m1')).toBe(true)
    expect(seen.isNew('m2')).toBe(true)
    expect(seen.isNew('m3')).toBe(true)
    // m1 was evicted to make room; m2 and m3 are still remembered.
    expect(seen.isNew('m2')).toBe(false)
    expect(seen.isNew('m3')).toBe(false)
    expect(seen.isNew('m1')).toBe(true)
  })

  it('does not remember an id twice, so a repeat cannot fill the memory', () => {
    const seen = createSeenMessages(2)

    seen.isNew('m1')
    seen.isNew('m1')
    seen.isNew('m2')

    expect(seen.isNew('m1')).toBe(false)
    expect(seen.isNew('m2')).toBe(false)
  })
})
