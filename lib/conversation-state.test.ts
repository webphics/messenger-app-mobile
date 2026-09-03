import {
  applyMessagePage,
  emptyThread,
  findOffersConversation,
  isConversationUnread,
  isMessageVisibleTo,
  isOutgoing,
  mergeConversation,
  mergeMessages,
  messageSenderName,
  sortConversations,
  totalUnread,
  visibleMessages,
} from '@/lib/conversation-state'
import type {
  Conversation,
  CustomerMessage,
  Message,
  MessageType,
  StaffMessage,
} from '@/lib/types'

function customerMessage(
  id: string,
  createdAt: string,
  overrides: Partial<CustomerMessage> = {},
): CustomerMessage {
  return {
    id,
    body: id,
    messageType: 'text',
    createdAt,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany: true,
    ...overrides,
  }
}

function staffMessage(
  id: string,
  createdAt: string,
  overrides: Partial<StaffMessage> = {},
): StaffMessage {
  return {
    id,
    body: id,
    messageType: 'text',
    createdAt,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
    ...overrides,
  }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    ...overrides,
  } as Conversation
}

describe('isMessageVisibleTo', () => {
  const types: MessageType[] = ['text', 'media', 'voice', 'system']

  test.each(types)('a Customer sees a %s message in a group', (messageType) => {
    expect(isMessageVisibleTo('customer', 'group', { messageType })).toBe(true)
  })

  test.each(types)('an Agent sees a %s message in a Support DM', (messageType) => {
    expect(isMessageVisibleTo('agent', 'support_dm', { messageType })).toBe(true)
  })

  test.each(types)('an Admin sees a %s message in a Support DM', (messageType) => {
    expect(isMessageVisibleTo('admin', 'support_dm', { messageType })).toBe(true)
  })

  test.each(['text', 'media', 'voice'] as MessageType[])(
    'a Customer sees a %s message in their Support DM',
    (messageType) => {
      expect(isMessageVisibleTo('customer', 'support_dm', { messageType })).toBe(true)
    },
  )

  test('a Customer never sees a system message in their Support DM', () => {
    expect(isMessageVisibleTo('customer', 'support_dm', { messageType: 'system' })).toBe(false)
  })
})

describe('visibleMessages', () => {
  test('drops the assignment notice from a Customer thread and keeps the rest in order', () => {
    const messages = [
      customerMessage('a', '2026-08-13T08:00:00.000Z'),
      customerMessage('b', '2026-08-13T08:01:00.000Z', { messageType: 'system' }),
      customerMessage('c', '2026-08-13T08:02:00.000Z'),
    ]

    expect(visibleMessages('customer', 'support_dm', messages).map((m) => m.id)).toEqual(['a', 'c'])
  })

  test('leaves an Agent thread untouched', () => {
    const messages = [staffMessage('a', '2026-08-13T08:00:00.000Z', { messageType: 'system' })]
    expect(visibleMessages('agent', 'support_dm', messages)).toEqual(messages)
  })
})

describe('mergeMessages', () => {
  test('orders a merged thread oldest first', () => {
    const merged = mergeMessages(
      [customerMessage('b', '2026-08-13T08:01:00.000Z')],
      [customerMessage('a', '2026-08-13T08:00:00.000Z')],
    )
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  test('a message that arrives twice replaces rather than duplicates', () => {
    const merged = mergeMessages(
      [customerMessage('a', '2026-08-13T08:00:00.000Z', { receiptStatus: 'sent' })],
      [customerMessage('a', '2026-08-13T08:00:00.000Z', { receiptStatus: 'read' })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.receiptStatus).toBe('read')
  })

  test('two messages sharing a timestamp keep a stable order', () => {
    const at = '2026-08-13T08:00:00.000Z'
    const forwards = mergeMessages([], [customerMessage('b', at), customerMessage('a', at)])
    const backwards = mergeMessages([], [customerMessage('a', at), customerMessage('b', at)])
    expect(forwards.map((m) => m.id)).toEqual(backwards.map((m) => m.id))
  })

  test('returns what it was given when there is nothing to merge', () => {
    const existing = [customerMessage('a', '2026-08-13T08:00:00.000Z')]
    expect(mergeMessages(existing, [])).toBe(existing)
  })
})

describe('applyMessagePage', () => {
  const viewer = { role: 'customer', conversationType: 'support_dm' } as const

  test('the first page fills an empty thread and points the cursor at its oldest message', () => {
    const page = [
      customerMessage('a', '2026-08-13T08:00:00.000Z'),
      customerMessage('b', '2026-08-13T08:01:00.000Z'),
    ]

    expect(applyMessagePage(emptyThread(), page, viewer)).toEqual({
      messages: page,
      hasMore: true,
      cursor: 'a',
    })
  })

  test('an older page lands before what is already held', () => {
    const first = applyMessagePage(
      emptyThread(),
      [customerMessage('c', '2026-08-13T08:02:00.000Z')],
      viewer,
    )
    const second = applyMessagePage(
      first,
      [
        customerMessage('a', '2026-08-13T08:00:00.000Z'),
        customerMessage('b', '2026-08-13T08:01:00.000Z'),
      ],
      viewer,
    )

    expect(second.messages.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(second.cursor).toBe('a')
  })

  test('an empty page is the end of the thread', () => {
    const state = applyMessagePage(
      { messages: [], hasMore: true, cursor: 'a' },
      [],
      viewer,
    )
    expect(state).toEqual({ messages: [], hasMore: false, cursor: 'a' })
  })

  test('a page shortened by a withheld message is not the end of the thread', () => {
    const state = applyMessagePage(
      emptyThread(),
      [
        customerMessage('a', '2026-08-13T08:00:00.000Z', { messageType: 'system' }),
        customerMessage('b', '2026-08-13T08:01:00.000Z'),
      ],
      viewer,
    )

    expect(state.messages.map((m) => m.id)).toEqual(['b'])
    expect(state.hasMore).toBe(true)
  })

  test('a page of nothing but withheld messages still moves the cursor', () => {
    const state = applyMessagePage(
      { messages: [], hasMore: true, cursor: 'z' },
      [customerMessage('a', '2026-08-13T08:00:00.000Z', { messageType: 'system' })],
      viewer,
    )

    expect(state.messages).toEqual([])
    expect(state.cursor).toBe('a')
    expect(state.hasMore).toBe(true)
  })

  test('the same page applied twice changes nothing', () => {
    const page = [customerMessage('a', '2026-08-13T08:00:00.000Z')]
    const once = applyMessagePage(emptyThread(), page, viewer)
    expect(applyMessagePage(once, page, viewer)).toEqual(once)
  })

  test('an Agent keeps the system notice a Customer would not see', () => {
    const page = [customerMessage('a', '2026-08-13T08:00:00.000Z', { messageType: 'system' })]
    const state = applyMessagePage(emptyThread(), page, {
      role: 'agent',
      conversationType: 'support_dm',
    })
    expect(state.messages.map((m) => m.id)).toEqual(['a'])
  })
})

describe('isOutgoing', () => {
  test('a Customer message not from the company is theirs', () => {
    expect(isOutgoing(customerMessage('a', 'x', { fromCompany: false }), 'cust-1')).toBe(true)
  })

  test('a Customer message from the company is not', () => {
    expect(isOutgoing(customerMessage('a', 'x', { fromCompany: true }), 'cust-1')).toBe(false)
  })

  test('a staff message is outgoing only for its sender', () => {
    const message = staffMessage('a', 'x')
    expect(isOutgoing(message, 'agent-1')).toBe(true)
    expect(isOutgoing(message, 'agent-2')).toBe(false)
  })
})

describe('messageSenderName', () => {
  test('names a staff sender', () => {
    expect(messageSenderName(staffMessage('a', 'x'))).toBe('Jonah Reed')
  })

  test('names nobody in a Customer Support DM, where the company is one voice', () => {
    expect(messageSenderName(customerMessage('a', 'x'))).toBeUndefined()
  })
})

describe('isConversationUnread', () => {
  test('reads the count the list endpoint gives', () => {
    expect(isConversationUnread(conversation({ unreadCount: 3 }))).toBe(true)
    expect(isConversationUnread(conversation({ unreadCount: 0 }))).toBe(false)
  })

  test('falls back to the receipt where the API declined to count', () => {
    expect(
      isConversationUnread(
        conversation({ unreadCount: null, lastMessageRead: false, lastMessageMine: false }),
      ),
    ).toBe(true)
  })

  test('the viewer own last message is never unread', () => {
    expect(
      isConversationUnread(
        conversation({ unreadCount: null, lastMessageRead: false, lastMessageMine: true }),
      ),
    ).toBe(false)
  })
})

describe('sortConversations', () => {
  test('newest activity first', () => {
    const sorted = sortConversations([
      conversation({ id: 'old', lastMessageAt: '2026-08-01T00:00:00.000Z' }),
      conversation({ id: 'new', lastMessageAt: '2026-08-13T00:00:00.000Z' }),
    ])
    expect(sorted.map((c) => c.id)).toEqual(['new', 'old'])
  })

  test('a conversation nobody has written in yet goes last', () => {
    const sorted = sortConversations([
      conversation({ id: 'empty', lastMessageAt: null }),
      conversation({ id: 'spoken', lastMessageAt: '2026-08-01T00:00:00.000Z' }),
    ])
    expect(sorted.map((c) => c.id)).toEqual(['spoken', 'empty'])
  })

  test('does not mutate what it was given', () => {
    const list = [
      conversation({ id: 'old', lastMessageAt: '2026-08-01T00:00:00.000Z' }),
      conversation({ id: 'new', lastMessageAt: '2026-08-13T00:00:00.000Z' }),
    ]
    sortConversations(list)
    expect(list.map((c) => c.id)).toEqual(['old', 'new'])
  })
})

describe('mergeConversation', () => {
  test('adds a conversation the list did not have', () => {
    const merged = mergeConversation(
      [conversation({ id: 'a', lastMessageAt: '2026-08-01T00:00:00.000Z' })],
      conversation({ id: 'b', lastMessageAt: '2026-08-13T00:00:00.000Z' }),
    )
    expect(merged.map((c) => c.id)).toEqual(['b', 'a'])
  })

  test('replaces the row it already had rather than showing it twice', () => {
    const merged = mergeConversation(
      [conversation({ id: 'a', lastMessagePreview: 'stale' })],
      conversation({ id: 'a', lastMessagePreview: 'fresh' }),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.lastMessagePreview).toBe('fresh')
  })
})

describe('findOffersConversation', () => {
  test('finds the group by its title', () => {
    const offers = conversation({ id: 'g1', type: 'group', title: 'Offers' })
    expect(findOffersConversation([conversation(), offers])?.id).toBe('g1')
  })

  test('ignores case and surrounding space, the way a title typed by hand arrives', () => {
    const offers = conversation({ id: 'g1', type: 'group', title: '  offers ' })
    expect(findOffersConversation([offers])?.id).toBe('g1')
  })

  test('does not mistake a support thread titled Offers for the group', () => {
    const staffRow = conversation({ id: 's1', type: 'support_dm', title: 'Offers' })
    expect(findOffersConversation([staffRow])).toBeUndefined()
  })

  test('is undefined when no Offers group exists', () => {
    expect(findOffersConversation([conversation()])).toBeUndefined()
  })
})

describe('totalUnread', () => {
  test('adds the counts up', () => {
    expect(
      totalUnread([conversation({ unreadCount: 2 }), conversation({ id: 'b', unreadCount: 3 })]),
    ).toBe(5)
  })

  test('counts a row the API declined to count as nothing rather than as NaN', () => {
    expect(totalUnread([conversation({ unreadCount: null })])).toBe(0)
  })
})
