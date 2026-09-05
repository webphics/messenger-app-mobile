import {
  applyIncomingMessage,
  applyMessagePage,
  applyNewestPage,
  applySentMessage,
  beginSend,
  beginUpload,
  draftMessage,
  emptyThread,
  failSend,
  refuseSend,
  findOffersConversation,
  findUnsent,
  isLocalId,
  isConversationUnread,
  isMessageVisibleTo,
  isOutgoing,
  mergeConversation,
  mergeMessages,
  messageSenderName,
  deliveryStates,
  sortConversations,
  threadContinues,
  threadMessages,
  totalUnread,
  visibleMessages,
  withConversationRead,
  withIncomingMessage,
  withoutConversation,
  withoutPages,
  withReassignment,
} from '@/lib/conversation-state'
import { parseConversationReassigned, parseMessageCreated } from '@/lib/realtime-events'
import type {
  DeliveryState,
  Reassignment,
  ReassignmentReason,
  ThreadState,
} from '@/lib/conversation-state'
import type {
  Conversation,
  CustomerMessage,
  Message,
  MessageType,
  StaffConversation,
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
      unsent: [],
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
      { ...emptyThread(), cursor: 'a' },
      [],
      viewer,
    )
    expect(state).toEqual({ messages: [], unsent: [], hasMore: false, cursor: 'a' })
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
      { ...emptyThread(), cursor: 'z' },
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

describe('keepUnreadCount, through mergeConversation', () => {
  test.each([
    ['a row that declines to count keeps the count the list gave it', 3, null, 3],
    ['a row that counts replaces the count the list gave it', 3, 0, 0],
    ['a count arrives where the list had none', null, 2, 2],
    ['neither side counted, so neither does the merge', null, null, null],
  ] as const)('%s', (_name, held, arriving, expected) => {
    const merged = mergeConversation(
      [conversation({ id: 'a', unreadCount: held })],
      conversation({ id: 'a', unreadCount: arriving }),
    )
    expect(merged[0]?.unreadCount).toBe(expected)
  })

  test('a row the list never had keeps its own count, counted or not', () => {
    const merged = mergeConversation([], conversation({ id: 'a', unreadCount: null }))
    expect(merged[0]?.unreadCount).toBeNull()
  })
})

describe('withConversationRead', () => {
  const list = [
    conversation({ id: 'a', unreadCount: 2, lastMessageRead: false }),
    conversation({ id: 'b', unreadCount: 5, lastMessageRead: false }),
  ]

  test.each([
    ['a counted unread row', 3, false],
    ['a row the API declined to count, unread by receipt', null, false],
    ['a row counted at zero the receipt still calls unread', 0, false],
    ['a counted unread row whose receipt already says read', 3, true],
  ] as const)('%s ends up read on both halves of the fact', (_name, unreadCount, lastMessageRead) => {
    const [row] = withConversationRead(
      [conversation({ id: 'a', unreadCount, lastMessageRead })],
      'a',
    )
    expect(row).toMatchObject({ unreadCount: 0, lastMessageRead: true })
    expect(isConversationUnread(row!)).toBe(false)
  })

  test('reads the row named and leaves every other one alone', () => {
    const next = withConversationRead(list, 'a')
    expect(next[0]).toMatchObject({ id: 'a', unreadCount: 0, lastMessageRead: true })
    expect(next[1]).toBe(list[1])
  })

  test('changes nothing else about the row it reads', () => {
    const held = [conversation({ id: 'a', unreadCount: 4, lastMessagePreview: 'Hello' })]
    expect(withConversationRead(held, 'a')[0]).toMatchObject({
      id: 'a',
      lastMessagePreview: 'Hello',
    })
  })

  test('clears the badge that row was contributing', () => {
    expect(totalUnread(list)).toBe(7)
    expect(totalUnread(withConversationRead(list, 'a'))).toBe(5)
  })

  test.each([
    ['a row the list does not hold', 'missing'],
    ['a row that was already read', 'read'],
  ] as const)('answers the list it was given for %s', (_name, id) => {
    const held = [...list, conversation({ id: 'read', unreadCount: 0, lastMessageRead: true })]
    expect(withConversationRead(held, id)).toBe(held)
  })

  test('does not mutate what it was given', () => {
    withConversationRead(list, 'a')
    expect(list[0]).toMatchObject({ unreadCount: 2, lastMessageRead: false })
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

  test.each([
    ['an uncounted row the receipt calls read is worth nothing', true, false, 0],
    ['an uncounted row the viewer sent last is worth nothing', false, true, 0],
    ['an uncounted row unread by receipt is worth at least one', false, false, 1],
  ] as const)('%s', (_name, lastMessageRead, lastMessageMine, expected) => {
    expect(
      totalUnread([conversation({ unreadCount: null, lastMessageRead, lastMessageMine })]),
    ).toBe(expected)
  })

  test('never answers NaN for a row with no count', () => {
    expect(Number.isFinite(totalUnread([conversation({ unreadCount: null })]))).toBe(true)
  })

  test('a badge and a row never disagree about whether there is something to read', () => {
    const uncounted = conversation({
      unreadCount: null,
      lastMessageRead: false,
      lastMessageMine: false,
    })
    expect(isConversationUnread(uncounted)).toBe(true)
    expect(totalUnread([uncounted])).toBeGreaterThan(0)
  })
})

describe('draftMessage', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const

  test('a Customer draft is theirs rather than the company speaking', () => {
    const message = draftMessage({
      id: 'local-1',
      body: 'Is my payout on the way?',
      author,
      sentAt: '2026-08-13T08:00:00.000Z',
    })

    expect(message).toEqual({
      id: 'local-1',
      body: 'Is my payout on the way?',
      messageType: 'text',
      createdAt: '2026-08-13T08:00:00.000Z',
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
      fromCompany: false,
    })
  })

  test('a staff draft names its sender', () => {
    const message = draftMessage({
      id: 'local-1',
      body: 'Looking now.',
      author: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
      sentAt: '2026-08-13T08:00:00.000Z',
    })

    expect(message).toMatchObject({
      sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
    })
    expect('fromCompany' in message).toBe(false)
  })

  test('a reply carries the quoted id and a preview of it', () => {
    const quoted = customerMessage('msg-1', '2026-08-13T08:00:00.000Z', {
      body: 'x'.repeat(200),
    })
    const message = draftMessage({ id: 'local-1', body: 'Thanks', author, replyTo: quoted })

    expect(message.replyTo).toEqual({ id: 'msg-1', preview: 'x'.repeat(140) })
  })

  test('an attachment makes it a media message', () => {
    const message = draftMessage({
      id: 'local-1',
      body: '',
      author,
      attachments: [
        {
          type: 'image/png',
          url: 'file:///receipt.png',
          fileName: 'receipt.png',
          size: 1024,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    expect(message.messageType).toBe('media')
  })
})

describe('isLocalId', () => {
  test.each([
    ['local-1757000000000-1', true],
    ['0b4f1f2c-9d1e-4a5b-8c3d-2e1f0a9b8c7d', false],
    ['', false],
  ])('%s is local: %s', (id, expected) => {
    expect(isLocalId(id)).toBe(expected)
  })
})

describe('beginSend', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const

  function draft(id: string, at: string) {
    return draftMessage({ id, body: id, author, sentAt: at })
  }

  test('the message joins the thread marked as on its way', () => {
    const state = beginSend(emptyThread(), draft('local-1', '2026-08-13T08:00:00.000Z'))

    expect(state.unsent).toEqual([
      { message: draft('local-1', '2026-08-13T08:00:00.000Z'), state: 'sending' },
    ])
    expect(state.messages).toEqual([])
  })

  test('sending again re-marks the message rather than stacking a second copy', () => {
    const message = draft('local-1', '2026-08-13T08:00:00.000Z')
    const failed = failSend(beginSend(emptyThread(), message), 'local-1')

    expect(beginSend(failed, message).unsent).toEqual([{ message, state: 'sending' }])
  })

  test('leaves the pages it was given alone', () => {
    const held = applyMessagePage(
      emptyThread(),
      [customerMessage('msg-1', '2026-08-13T08:00:00.000Z')],
      { role: 'customer', conversationType: 'support_dm' },
    )
    const state = beginSend(held, draft('local-1', '2026-08-13T08:01:00.000Z'))

    expect(state.messages).toEqual(held.messages)
    expect(state.cursor).toBe('msg-1')
  })
})

describe('applySentMessage', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const
  const echo = draftMessage({
    id: 'local-1',
    body: 'Is my payout on the way?',
    author,
    sentAt: '2026-08-13T08:01:00.000Z',
  })
  const stored = customerMessage('msg-2', '2026-08-13T08:01:00.500Z', {
    body: 'Is my payout on the way?',
    fromCompany: false,
  })

  test('the stored message takes the echo place rather than joining it', () => {
    const state = applySentMessage(beginSend(emptyThread(), echo), 'local-1', stored)

    expect(state.unsent).toEqual([])
    expect(state.messages.map((m) => m.id)).toEqual(['msg-2'])
  })

  test('it lands after the history already held', () => {
    const held = applyMessagePage(
      emptyThread(),
      [customerMessage('msg-1', '2026-08-13T08:00:00.000Z')],
      { role: 'customer', conversationType: 'support_dm' },
    )
    const state = applySentMessage(beginSend(held, echo), 'local-1', stored)

    expect(state.messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2'])
  })

  test('a refresh that already brought the stored message does not show it twice', () => {
    const viewer = { role: 'customer', conversationType: 'support_dm' } as const
    const raced = applyMessagePage(beginSend(emptyThread(), echo), [stored], viewer)
    const state = applySentMessage(raced, 'local-1', stored)

    expect(state.messages.map((m) => m.id)).toEqual(['msg-2'])
    expect(state.unsent).toEqual([])
  })

  test('another message still sending is left where it is', () => {
    const other = draftMessage({
      id: 'local-2',
      body: 'And the fee?',
      author,
      sentAt: '2026-08-13T08:02:00.000Z',
    })
    const state = applySentMessage(
      beginSend(beginSend(emptyThread(), echo), other),
      'local-1',
      stored,
    )

    expect(state.unsent).toEqual([{ message: other, state: 'sending' }])
  })

  test('an answer for a message no longer held only adds the stored message', () => {
    const state = applySentMessage(emptyThread(), 'local-1', stored)

    expect(state.messages.map((m) => m.id)).toEqual(['msg-2'])
    expect(state.unsent).toEqual([])
  })

  test('does not mutate what it was given', () => {
    const before = beginSend(emptyThread(), echo)
    applySentMessage(before, 'local-1', stored)

    expect(before.unsent).toHaveLength(1)
    expect(before.messages).toEqual([])
  })
})

describe('failSend', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const
  const echo = draftMessage({ id: 'local-1', body: 'Hello', author, sentAt: 'x' })

  test('a failed send keeps its bubble, marked', () => {
    const state = failSend(beginSend(emptyThread(), echo), 'local-1')

    expect(state.unsent).toEqual([{ message: echo, state: 'failed' }])
    expect(threadMessages(state).map((m) => m.id)).toEqual(['local-1'])
  })

  test('marks only the message named', () => {
    const other = draftMessage({ id: 'local-2', body: 'And', author, sentAt: 'y' })
    const state = failSend(beginSend(beginSend(emptyThread(), echo), other), 'local-1')

    expect(deliveryStates(state.unsent)).toEqual(
      new Map([
        ['local-1', 'failed'],
        ['local-2', 'sending'],
      ]),
    )
  })

  test('a message nobody is holding changes nothing', () => {
    const before = beginSend(emptyThread(), echo)
    expect(failSend(before, 'local-9')).toEqual(before)
  })
})

describe('refuseSend', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const
  const echo = draftMessage({ id: 'local-1', body: 'Hello', author, sentAt: 'x' })

  /**
   * The case `failSend` cannot answer: a first send stopped on its way out — a
   * staged file that is no longer on the phone — has put nothing in the thread
   * yet, so there is nothing there for a mark to find.
   */
  test('a send stopped before it began still gets its bubble, marked', () => {
    const state = refuseSend(emptyThread(), echo)

    expect(state.unsent).toEqual([{ message: echo, state: 'failed' }])
    expect(threadMessages(state).map((m) => m.id)).toEqual(['local-1'])
  })

  test('a retry stopped the same way marks the bubble already there', () => {
    const state = refuseSend(beginSend(emptyThread(), echo), echo)

    expect(state.unsent).toEqual([{ message: echo, state: 'failed' }])
  })

  test('leaves the other messages on their way out alone', () => {
    const other = draftMessage({ id: 'local-2', body: 'And', author, sentAt: 'y' })

    const state = refuseSend(beginSend(emptyThread(), other), echo)

    expect(deliveryStates(state.unsent)).toEqual(
      new Map([
        ['local-2', 'sending'],
        ['local-1', 'failed'],
      ]),
    )
  })
})

describe('the send lifecycle', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const
  const echo = draftMessage({ id: 'local-1', body: 'Hello', author, sentAt: 'x' })
  const stored = customerMessage('msg-1', '2026-08-13T08:00:00.000Z', { fromCompany: false })

  const sending = () => beginSend(emptyThread(), echo)
  const failed = () => failSend(sending(), 'local-1')

  /** Each row: where the thread was, what happened, what it shows and how it reads. */
  test.each([
    ['nothing sent yet', emptyThread, [], []],
    ['the send starts', sending, ['local-1'], [['local-1', 'sending']]],
    ['the send fails', failed, ['local-1'], [['local-1', 'failed']]],
    ['the API answers', () => applySentMessage(sending(), 'local-1', stored), ['msg-1'], []],
    ['a retry after a failure', () => beginSend(failed(), echo), ['local-1'], [['local-1', 'sending']]],
    ['a retry that lands', () => applySentMessage(failed(), 'local-1', stored), ['msg-1'], []],
    ['a refresh mid-send', () => withoutPages(sending()), ['local-1'], [['local-1', 'sending']]],
  ] as [string, () => ThreadState, string[], [string, DeliveryState][]][])(
    '%s',
    (_name, build, shown, delivery) => {
      const state = build()
      expect(threadMessages(state).map((m) => m.id)).toEqual(shown)
      expect([...deliveryStates(state.unsent)]).toEqual(delivery)
    },
  )
})

describe('findUnsent', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const
  const echo = draftMessage({ id: 'local-1', body: 'Hello', author, sentAt: 'x' })

  test('finds a message still in flight', () => {
    expect(findUnsent(beginSend(emptyThread(), echo), 'local-1')).toEqual({
      message: echo,
      state: 'sending',
    })
  })

  test('is undefined once the API has answered for it', () => {
    const sent = customerMessage('msg-1', '2026-08-13T08:00:00.000Z')
    const state = applySentMessage(beginSend(emptyThread(), echo), 'local-1', sent)

    expect(findUnsent(state, 'local-1')).toBeUndefined()
  })
})

describe('threadMessages', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const

  test('a message on its way sits after the history in time order', () => {
    const held = applyMessagePage(
      emptyThread(),
      [
        customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
        customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
      ],
      { role: 'customer', conversationType: 'support_dm' },
    )
    const state = beginSend(
      held,
      draftMessage({ id: 'local-1', body: 'Hi', author, sentAt: '2026-08-13T08:02:00.000Z' }),
    )

    expect(threadMessages(state).map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'local-1'])
  })

  test('a settled thread is its pages', () => {
    const held = applyMessagePage(
      emptyThread(),
      [customerMessage('msg-1', '2026-08-13T08:00:00.000Z')],
      { role: 'customer', conversationType: 'support_dm' },
    )

    expect(threadMessages(held)).toEqual(held.messages)
  })
})

describe('deliveryStates', () => {
  test('a thread with nothing in flight reports nothing', () => {
    expect(deliveryStates(emptyThread().unsent).size).toBe(0)
  })
})

describe('withoutPages', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const

  test('a refresh drops the pages and keeps the message still going out', () => {
    const echo = draftMessage({ id: 'local-1', body: 'Hi', author, sentAt: 'x' })
    const held = beginSend(
      applyMessagePage(emptyThread(), [customerMessage('msg-1', '2026-08-13T08:00:00.000Z')], {
        role: 'customer',
        conversationType: 'support_dm',
      }),
      echo,
    )

    expect(withoutPages(held)).toEqual({
      messages: [],
      unsent: [{ message: echo, state: 'sending' }],
      hasMore: true,
      cursor: undefined,
    })
  })
})

/**
 * The socket half of the same rules the REST half is tested against above.
 *
 * The payloads are the API's own, read through `lib/realtime-events` so these
 * are the objects the socket layer actually hands the merge — a synthetic event
 * end to end, with no socket and no React anywhere near it.
 */
function messageCreatedEvent(
  id: string,
  createdAt: string,
  message: Partial<CustomerMessage> = {},
) {
  const event = parseMessageCreated({
    conversationId: 'conv-1',
    message: {
      id,
      body: id,
      messageType: 'text',
      createdAt,
      fromCompany: true,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
      ...message,
    },
  })
  if (!event) throw new Error('the fixture is not a payload this app can read')
  return event
}

const CUSTOMER_VIEWER = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const

describe('applyIncomingMessage', () => {
  test('puts a message that arrived over the socket in its place in the thread', () => {
    const state: ThreadState = {
      ...emptyThread(),
      messages: [
        customerMessage('a', '2026-08-13T08:00:00.000Z'),
        customerMessage('c', '2026-08-13T08:02:00.000Z'),
      ],
    }

    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')
    const next = applyIncomingMessage(state, event.message, CUSTOMER_VIEWER)

    expect(next.messages.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  test('the API’s duplicate of one message is still one message', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')

    const once = applyIncomingMessage(emptyThread(), event.message, CUSTOMER_VIEWER)
    const twice = applyIncomingMessage(once, event.message, CUSTOMER_VIEWER)

    expect(twice.messages.map((m) => m.id)).toEqual(['b'])
  })

  test('a resync that re-fetches the message adds nothing to it', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')
    const live = applyIncomingMessage(emptyThread(), event.message, CUSTOMER_VIEWER)

    const resynced = applyMessagePage(
      withoutPages(live),
      [customerMessage('a', '2026-08-13T08:00:00.000Z'), event.message],
      CUSTOMER_VIEWER,
    )

    expect(resynced.messages.map((m) => m.id)).toEqual(['a', 'b'])
  })

  test('a Customer’s Support DM never shows an assignment notice that arrives live', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z', { messageType: 'system' })
    const state = emptyThread()

    expect(applyIncomingMessage(state, event.message, CUSTOMER_VIEWER)).toBe(state)
  })

  test('an Agent does see it', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z', { messageType: 'system' })
    const next = applyIncomingMessage(emptyThread(), event.message, {
      id: 'agent-1',
      role: 'agent',
      conversationType: 'support_dm',
    })

    expect(next.messages.map((m) => m.id)).toEqual(['b'])
  })

  test('leaves the backwards cursor and hasMore alone', () => {
    const state: ThreadState = { ...emptyThread(), cursor: 'a', hasMore: true }
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')

    const next = applyIncomingMessage(state, event.message, CUSTOMER_VIEWER)

    expect(next.cursor).toBe('a')
    expect(next.hasMore).toBe(true)
  })

  test('keeps a message still on its way out', () => {
    const sending = beginSend(emptyThread(), customerMessage('local-1', '2026-08-13T08:03:00.000Z'))
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')

    expect(applyIncomingMessage(sending, event.message, CUSTOMER_VIEWER).unsent).toHaveLength(1)
  })
})

describe('withIncomingMessage', () => {
  const rows = [
    conversation({ id: 'conv-1', lastMessageAt: '2026-08-13T08:00:00.000Z', unreadCount: 0 }),
    conversation({ id: 'conv-2', lastMessageAt: '2026-08-13T09:00:00.000Z', unreadCount: 0 }),
  ]

  test('counts a staff reply as one more unread', () => {
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z', { body: 'On it' })
    const next = withIncomingMessage(rows, 'conv-1', event.message, 'customer-1')

    expect(next[0]).toMatchObject({
      id: 'conv-1',
      unreadCount: 1,
      lastMessageAt: '2026-08-13T10:00:00.000Z',
      lastMessagePreview: 'On it',
      lastMessageMine: false,
      lastMessageRead: false,
      lastMessageReceiptStatus: null,
    })
  })

  test('adds to a count that is already standing', () => {
    const held = [conversation({ id: 'conv-1', unreadCount: 3 })]
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    expect(withIncomingMessage(held, 'conv-1', event.message, 'customer-1')[0].unreadCount).toBe(4)
  })

  test('the viewer’s own message from another device counts for nothing', () => {
    const held = [conversation({ id: 'conv-1', unreadCount: 2 })]
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z', {
      fromCompany: false,
      receiptStatus: 'delivered',
    })

    expect(withIncomingMessage(held, 'conv-1', event.message, 'customer-1')[0]).toMatchObject({
      unreadCount: 2,
      lastMessageMine: true,
      lastMessageRead: true,
      lastMessageReceiptStatus: 'delivered',
    })
  })

  test('an uncounted row stays uncounted, and reads as unread by receipt', () => {
    const held = [conversation({ id: 'conv-1', unreadCount: null, lastMessageRead: true })]
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    const next = withIncomingMessage(held, 'conv-1', event.message, 'customer-1')

    expect(next[0].unreadCount).toBeNull()
    expect(isConversationUnread(next[0])).toBe(true)
  })

  test('moves the conversation to the top of the list', () => {
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    expect(
      withIncomingMessage(rows, 'conv-1', event.message, 'customer-1').map((row) => row.id),
    ).toEqual(['conv-1', 'conv-2'])
  })

  test('the tab badge follows, which is what makes it live', () => {
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    expect(totalUnread(rows)).toBe(0)
    expect(totalUnread(withIncomingMessage(rows, 'conv-1', event.message, 'customer-1'))).toBe(1)
  })

  test('a message for a conversation this client has never heard of changes nothing', () => {
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    expect(withIncomingMessage(rows, 'conv-9', event.message, 'customer-1')).toBe(rows)
  })

  test('a reaction on an older message leaves the row exactly as it was', () => {
    // What the API broadcasts when somebody reacts: the reacted message, whole,
    // on `message.created`. Read as an arrival it would drag the row back to
    // yesterday and preview it with yesterday's body.
    const reacted = messageCreatedEvent('a', '2026-08-12T08:00:00.000Z', { body: 'Yesterday' })

    expect(withIncomingMessage(rows, 'conv-1', reacted.message, 'customer-1')).toBe(rows)
  })

  test('nor does one on the newest message, which shares the row’s timestamp', () => {
    const reacted = messageCreatedEvent('a', '2026-08-13T08:00:00.000Z')

    expect(withIncomingMessage(rows, 'conv-1', reacted.message, 'customer-1')).toBe(rows)
  })

  test('a row nobody has written in yet still takes its first message', () => {
    const empty = [conversation({ id: 'conv-1', lastMessageAt: null, unreadCount: 0 })]
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z')

    expect(withIncomingMessage(empty, 'conv-1', event.message, 'customer-1')[0]).toMatchObject({
      lastMessageAt: '2026-08-13T10:00:00.000Z',
      unreadCount: 1,
    })
  })

  test('previews a long message at the length the API previews it', () => {
    const event = messageCreatedEvent('b', '2026-08-13T10:00:00.000Z', { body: 'x'.repeat(200) })

    expect(
      withIncomingMessage(rows, 'conv-1', event.message, 'customer-1')[0].lastMessagePreview,
    ).toHaveLength(140)
  })

  describe('a staff row', () => {
    const staffRows = [conversation({ id: 'conv-1', unreadCount: 2 })]

    test('counts another agent’s reply', () => {
      const message = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        body: 'Taking this one',
        sender: { id: 'agent-2', name: 'Rae', role: 'agent' },
      })

      expect(withIncomingMessage(staffRows, 'conv-1', message, 'agent-1')[0]).toMatchObject({
        unreadCount: 3,
        lastMessagePreview: 'Taking this one',
        lastMessageMine: false,
        lastMessageRead: false,
      })
    })

    test('counts nothing for the staff member’s own reply, sent from elsewhere', () => {
      const message = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        body: 'On it',
        receiptStatus: 'delivered',
      })

      expect(withIncomingMessage(staffRows, 'conv-1', message, 'agent-1')[0]).toMatchObject({
        unreadCount: 2,
        lastMessageMine: true,
        lastMessageRead: true,
        lastMessageReceiptStatus: 'delivered',
      })
    })

    test('an Engage notice moves the row without counting, as the API counts it', () => {
      const notice = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        messageType: 'system',
        body: 'Rae joined the support chat',
        sender: { id: 'agent-2', name: 'Rae', role: 'agent' },
      })

      expect(withIncomingMessage(staffRows, 'conv-1', notice, 'agent-1')[0]).toMatchObject({
        unreadCount: 2,
        lastMessageAt: '2026-08-13T10:00:00.000Z',
        lastMessagePreview: 'Rae joined the support chat',
      })
    })

    test('the count is all a notice is withheld from', () => {
      const notice = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        messageType: 'system',
        receiptStatus: 'delivered',
        sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
      })

      // The row the API sends beside the notice derives all three from it, so a
      // client that froze them would diverge until the next list fetch.
      expect(withIncomingMessage(staffRows, 'conv-1', notice, 'agent-1')[0]).toMatchObject({
        lastMessageMine: true,
        lastMessageReceiptStatus: 'delivered',
        lastMessageRead: true,
      })
    })

    test('an uncounted row is left uncounted, the notice included', () => {
      const held = [conversation({ id: 'conv-1', unreadCount: null, lastMessageRead: true })]
      const notice = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        messageType: 'system',
        sender: { id: 'agent-2', name: 'Rae', role: 'agent' },
      })

      // Null means the API declined to count, so there is no count to withhold
      // the notice from. What the row reads as then is the receipt's business,
      // and the `conversation.updated` beside the notice restates it either way.
      expect(withIncomingMessage(held, 'conv-1', notice, 'agent-1')[0].unreadCount).toBeNull()
    })

    test('the tab badge does not move for a notice', () => {
      const notice = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        messageType: 'system',
        sender: { id: 'agent-2', name: 'Rae', role: 'agent' },
      })

      expect(totalUnread(withIncomingMessage(staffRows, 'conv-1', notice, 'agent-1'))).toBe(2)
    })
  })
})

describe('withReassignment', () => {
  /**
   * A staff Support DM row. `labels` is what makes it one — the shape a Customer
   * receives carries no assignment at all, which is the last case in the table.
   */
  function supportRow(overrides: Partial<StaffConversation> = {}): Conversation {
    return conversation({
      id: 'conv-1',
      type: 'support_dm',
      status: 'engaged',
      title: null,
      description: null,
      avatarUrl: null,
      customer: { id: 'cust-1', name: 'QA Customer' },
      assignedAgent: { id: 'agent-1', name: 'QA Agent' },
      otherUser: null,
      members: [],
      labels: [],
      ...overrides,
    } as Partial<Conversation>)
  }

  const ADMIN = { id: 'admin-1', name: 'Admin' }

  function event(overrides: Partial<Reassignment> = {}): Reassignment {
    return {
      conversationId: 'conv-1',
      reason: 'taken_over',
      assignee: ADMIN,
      ...overrides,
    }
  }

  describe('a thread the viewer still has every right to see', () => {
    test.each([
      [
        'an Admin took it, so the row names the Admin and stays engaged',
        'taken_over' as ReassignmentReason,
        ADMIN,
        { assignedAgent: ADMIN, status: 'engaged' },
      ],
      [
        'the assignee transferred it, so the row names whoever received it',
        'transferred' as ReassignmentReason,
        { id: 'agent-2', name: 'Rae' },
        { assignedAgent: { id: 'agent-2', name: 'Rae' }, status: 'engaged' },
      ],
      [
        'nobody holds it, so it goes back to the pool',
        'taken_over' as ReassignmentReason,
        null,
        { assignedAgent: null, status: 'unassigned' },
      ],
    ] as const)('%s', (_name, reason, assignee, expected) => {
      const next = withReassignment([supportRow()], event({ reason, assignee }))

      expect(next).toHaveLength(1)
      expect(next[0]).toMatchObject(expected)
    })

    test('keeps everything the event does not speak for', () => {
      const held = supportRow({ lastMessagePreview: 'Where is my order?', unreadCount: 4 })

      expect(withReassignment([held], event())[0]).toMatchObject({
        id: 'conv-1',
        lastMessagePreview: 'Where is my order?',
        unreadCount: 4,
      })
    })

    test('takes only the assignee’s id and name; presence is the row update’s to carry', () => {
      const next = withReassignment(
        [supportRow()],
        event({ assignee: { id: 'admin-1', name: 'Admin' } }),
      )

      expect(next[0]).toMatchObject({ assignedAgent: { id: 'admin-1', name: 'Admin' } })
    })

    test('leaves the rows either side of it alone', () => {
      const list = [supportRow({ id: 'other' }), supportRow(), supportRow({ id: 'later' })]
      const next = withReassignment(list, event())

      expect(next.map((row) => row.id)).toEqual(['other', 'conv-1', 'later'])
      expect(next[0]).toBe(list[0])
      expect(next[2]).toBe(list[2])
    })

    test('does not mutate the list it was given', () => {
      const list = [supportRow()]
      withReassignment(list, event())

      expect(list[0]).toMatchObject({ assignedAgent: { id: 'agent-1', name: 'QA Agent' } })
    })
  })

  describe('a membership that was revoked', () => {
    test('drops the row, because the thread is in an organization the viewer has left', () => {
      const next = withReassignment(
        [supportRow(), supportRow({ id: 'other' })],
        event({ reason: 'membership_revoked', assignee: null }),
      )

      expect(next.map((row) => row.id)).toEqual(['other'])
    })

    test('drops it whoever the API says holds it now', () => {
      expect(
        withReassignment([supportRow()], event({ reason: 'membership_revoked', assignee: ADMIN })),
      ).toEqual([])
    })
  })

  describe('an event with nothing to apply', () => {
    test.each([
      ['a conversation this client has never held', event({ conversationId: 'unknown' })],
      [
        'a revocation for one it has never held',
        event({ conversationId: 'unknown', reason: 'membership_revoked', assignee: null }),
      ],
    ] as const)('answers the same list for %s', (_name, reassignment) => {
      const list = [supportRow()]
      expect(withReassignment(list, reassignment)).toBe(list)
    })

    test('answers the same list for a Customer’s row, which carries no assignment', () => {
      // A Customer is never sent this event; the guard is here because the list
      // this walks holds every shape the API sends.
      const list = [conversation({ id: 'conv-1', type: 'support_dm' })]
      expect(withReassignment(list, event())).toBe(list)
    })
  })

  test('applies the payload the running API sent, end to end', () => {
    const parsed = parseConversationReassigned({
      conversationId: 'conv-1',
      reason: 'taken_over',
      currentAssignee: { id: 'admin-1', name: 'Admin', role: 'admin' },
      engagedStaffCount: 2,
      engagedStaff: [
        { id: 'admin-1', name: 'Admin', role: 'admin' },
        { id: 'agent-1', name: 'QA Agent', role: 'agent' },
      ],
    })

    expect(parsed).not.toBeNull()
    const next = withReassignment([supportRow()], parsed!)

    expect(next[0]).toMatchObject({
      status: 'engaged',
      assignedAgent: { id: 'admin-1', name: 'Admin' },
    })
  })
})

describe('withoutConversation', () => {
  const rows = [conversation({ id: 'conv-1' }), conversation({ id: 'conv-2' })]

  test('drops the conversation the server says is gone', () => {
    expect(withoutConversation(rows, 'conv-1').map((row) => row.id)).toEqual(['conv-2'])
  })

  test('answers the same list when the row was never held', () => {
    expect(withoutConversation(rows, 'conv-9')).toBe(rows)
  })

  test('a deletion this client hears twice is still one deletion', () => {
    const once = withoutConversation(rows, 'conv-1')
    expect(withoutConversation(once, 'conv-1')).toBe(once)
  })
})

describe('applyIncomingMessage and the echo of a message sent from here', () => {
  const viewer = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const

  function sending(body: string): ThreadState {
    return beginSend(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body,
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
      }),
    )
  }

  test('the socket copy confirms it, so the thread shows one message and not two', () => {
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: false,
    })

    const next = applyIncomingMessage(sending('Any update?'), event.message, viewer)

    expect(next.unsent).toEqual([])
    expect(threadMessages(next).map((m) => m.id)).toEqual(['server-1'])
  })

  test('the answer that lands afterwards has nothing left to remove', () => {
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: false,
    })
    const confirmed = applyIncomingMessage(sending('Any update?'), event.message, viewer)

    const settled = applySentMessage(confirmed, 'local-1', event.message)

    expect(settled.unsent).toEqual([])
    expect(settled.messages.map((m) => m.id)).toEqual(['server-1'])
  })

  test('a send whose request then fails is not marked failed, because it landed', () => {
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: false,
    })
    const confirmed = applyIncomingMessage(sending('Any update?'), event.message, viewer)

    expect(failSend(confirmed, 'local-1').unsent).toEqual([])
  })

  test('a send that already failed keeps its place, and its offer to go again', () => {
    const failed = failSend(sending('Any update?'), 'local-1')
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: false,
    })

    const next = applyIncomingMessage(failed, event.message, viewer)

    expect(next.unsent).toEqual([{ message: expect.objectContaining({ id: 'local-1' }), state: 'failed' }])
  })

  test('a staff message with the same words confirms nothing', () => {
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: true,
    })

    const next = applyIncomingMessage(sending('Any update?'), event.message, viewer)

    expect(next.unsent).toHaveLength(1)
  })

  test('someone else’s message leaves a send of different words alone', () => {
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Something else',
      fromCompany: false,
    })

    expect(applyIncomingMessage(sending('Any update?'), event.message, viewer).unsent).toHaveLength(
      1,
    )
  })

  test('two sends of the same words confirm one at a time, oldest first', () => {
    const first = sending('Any update?')
    const both = beginSend(
      first,
      draftMessage({
        id: 'local-2',
        body: 'Any update?',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:02.000Z',
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:03.000Z', {
      body: 'Any update?',
      fromCompany: false,
    })

    const next = applyIncomingMessage(both, event.message, viewer)

    expect(next.unsent.map((entry) => entry.message.id)).toEqual(['local-2'])
  })

  test('an empty body confirms nothing, because every empty body matches', () => {
    const emptyEcho = beginSend(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body: '',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: '',
      fromCompany: false,
    })

    expect(applyIncomingMessage(emptyEcho, event.message, viewer).unsent).toHaveLength(1)
  })

  /**
   * The one case an empty body cannot answer, and the reason a message carrying
   * attachments is matched on them instead: by the time the send is out, the
   * unsent copy holds what the upload answered with, and the arriving copy names
   * the same stored objects.
   */
  test('a photo with no caption is confirmed by the object it names', () => {
    const stored = {
      type: 'image/jpeg',
      url: '/uploads/chat/9f1c.jpg',
      fileName: 'IMG_0001.jpg',
      size: 2048,
      durationSeconds: null,
      waveform: null,
    }
    const sendingPhoto = beginSend(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body: '',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
        attachments: [stored],
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: '',
      fromCompany: false,
      messageType: 'media',
      attachments: [stored],
    })

    const next = applyIncomingMessage(sendingPhoto, event.message, viewer)

    expect(next.unsent).toHaveLength(0)
    expect(next.messages.map((message) => message.id)).toEqual(['server-1'])
  })

  test('a different photo confirms nothing, however alike the two captions are', () => {
    const sendingPhoto = beginSend(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body: 'Here',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
        attachments: [
          {
            type: 'image/jpeg',
            url: '/uploads/chat/mine.jpg',
            fileName: null,
            size: null,
            durationSeconds: null,
            waveform: null,
          },
        ],
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Here',
      fromCompany: false,
      messageType: 'media',
      attachments: [
        {
          type: 'image/jpeg',
          url: '/uploads/chat/theirs.jpg',
          fileName: null,
          size: null,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    expect(applyIncomingMessage(sendingPhoto, event.message, viewer).unsent).toHaveLength(1)
  })

  /**
   * One of them is a photo. Matching them on the caption they happen to share
   * would confirm a message the server has never been told about.
   */
  test('a message with attachments never confirms one without them', () => {
    const sendingText = beginSend(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body: 'Look',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Look',
      fromCompany: false,
      messageType: 'media',
      attachments: [
        {
          type: 'image/jpeg',
          url: '/uploads/chat/a.jpg',
          fileName: null,
          size: null,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    expect(applyIncomingMessage(sendingText, event.message, viewer).unsent).toHaveLength(1)
  })

  /**
   * Nothing has reached the server yet, so nothing arriving can be the echo of
   * it — and dropping the bubble here would take the upload's own progress with
   * it.
   */
  test('a message still uploading is confirmed by nothing', () => {
    const stored = {
      type: 'image/jpeg',
      url: 'file:///cache/IMG_0001.jpg',
      fileName: 'IMG_0001.jpg',
      size: 2048,
      durationSeconds: null,
      waveform: null,
    }
    const uploading = beginUpload(
      emptyThread(),
      draftMessage({
        id: 'local-1',
        body: 'Here',
        author: { id: 'customer-1', name: 'QA', role: 'customer' },
        sentAt: '2026-08-13T08:00:00.000Z',
        attachments: [stored],
      }),
    )
    const event = messageCreatedEvent('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Here',
      fromCompany: false,
      messageType: 'media',
      attachments: [stored],
    })

    expect(applyIncomingMessage(uploading, event.message, viewer).unsent).toHaveLength(1)
  })
})

describe('the two waits a send with a file goes through', () => {
  const author = { id: 'customer-1', name: 'QA', role: 'customer' as const }

  function photoDraft(url: string) {
    return draftMessage({
      id: 'local-1',
      body: 'Here it is',
      author,
      sentAt: '2026-08-13T08:00:00.000Z',
      attachments: [
        {
          type: 'image/jpeg',
          url,
          fileName: 'IMG_0001.jpg',
          size: 2048,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })
  }

  test('an upload is its own state, distinct from the send that follows', () => {
    const uploading = beginUpload(emptyThread(), photoDraft('file:///cache/IMG_0001.jpg'))

    expect(deliveryStates(uploading.unsent).get('local-1')).toBe('uploading')
  })

  /**
   * The bubble on screen is the same bubble, holding what the upload answered
   * with. Two entries would be two bubbles.
   */
  test('the send replaces the upload rather than stacking beneath it', () => {
    const uploading = beginUpload(emptyThread(), photoDraft('file:///cache/IMG_0001.jpg'))
    const sending = beginSend(uploading, photoDraft('/uploads/chat/9f1c.jpg'))

    expect(sending.unsent).toHaveLength(1)
    expect(deliveryStates(sending.unsent).get('local-1')).toBe('sending')
    expect(sending.unsent[0].message.attachments[0].url).toBe('/uploads/chat/9f1c.jpg')
  })

  test('a message that carries a file is media rather than text', () => {
    expect(photoDraft('/uploads/chat/9f1c.jpg').messageType).toBe('media')
  })

  /**
   * A message carrying three files whose third upload failed has two of them in
   * the object store already. Dropping what came back would make the retry send
   * all three again and orphan the first two, every attempt.
   */
  test('a failed send keeps whatever did reach the store', () => {
    const local = photoDraft('file:///cache/IMG_0001.jpg')
    const uploading = beginUpload(emptyThread(), local)

    const failed = failSend(uploading, 'local-1', {
      ...local,
      attachments: [{ ...local.attachments[0], url: '/uploads/chat/9f1c.jpg' }],
    })

    expect(deliveryStates(failed.unsent).get('local-1')).toBe('failed')
    expect(findUnsent(failed, 'local-1')?.message.attachments[0].url).toBe(
      '/uploads/chat/9f1c.jpg',
    )
  })

  test('a text send that failed keeps the message it was already holding', () => {
    const sending = beginSend(
      emptyThread(),
      draftMessage({ id: 'local-1', body: 'Hello', author, sentAt: '2026-08-13T08:00:00.000Z' }),
    )

    const failed = failSend(sending, 'local-1')

    expect(findUnsent(failed, 'local-1')?.message.body).toBe('Hello')
    expect(deliveryStates(failed.unsent).get('local-1')).toBe('failed')
  })
})

describe('threadContinues', () => {
  const held = [
    customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
    customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
  ]

  it('is true when the two runs have a message in common', () => {
    expect(
      threadContinues(held, [
        customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
        customerMessage('msg-3', '2026-08-13T08:02:00.000Z'),
      ]),
    ).toBe(true)
  })

  it('is false when nothing is in common, however close the timestamps', () => {
    expect(
      threadContinues(held, [customerMessage('msg-3', '2026-08-13T08:01:00.001Z')]),
    ).toBe(false)
  })

  /**
   * A page holding only messages this viewer may not see is still evidence that
   * the two runs meet, which is why the raw page is what this is asked about.
   */
  it('is true on a shared id whether or not the message would be shown', () => {
    const notice = customerMessage('msg-2', '2026-08-13T08:01:00.000Z', {
      messageType: 'system',
    })

    expect(threadContinues(held, [notice])).toBe(true)
  })

  it('is false for a thread holding nothing, which has nothing to continue', () => {
    expect(threadContinues([], held)).toBe(false)
  })

  it('is false for a page holding nothing', () => {
    expect(threadContinues(held, [])).toBe(false)
  })
})

describe('applyNewestPage', () => {
  const viewer = { role: 'customer', conversationType: 'support_dm' } as const

  function restored(): ThreadState {
    return {
      ...emptyThread(),
      messages: [
        customerMessage('msg-8', '2026-08-13T08:08:00.000Z'),
        customerMessage('msg-9', '2026-08-13T08:09:00.000Z'),
      ],
      hasMore: true,
      cursor: 'msg-8',
    }
  }

  it('begins a thread that is holding nothing, cursor and all', () => {
    const page = [
      customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
    ]

    expect(applyNewestPage(emptyThread(), page, viewer)).toEqual({
      messages: page,
      unsent: [],
      hasMore: true,
      cursor: 'msg-1',
    })
  })

  /**
   * The point of the whole arrangement: a thread Restored from this device has
   * already been read back through, and the page that confirms it must not send
   * the next scroll back over history the phone is holding.
   */
  it('leaves the frontier where it was when the page continues what is held', () => {
    const page = [
      customerMessage('msg-9', '2026-08-13T08:09:00.000Z'),
      customerMessage('msg-10', '2026-08-13T08:10:00.000Z'),
    ]

    const next = applyNewestPage(restored(), page, viewer)

    expect(next.cursor).toBe('msg-8')
    expect(next.hasMore).toBe(true)
    expect(next.messages.map((each) => each.id)).toEqual(['msg-8', 'msg-9', 'msg-10'])
  })

  it('takes the newer copy of a message it already held', () => {
    const read = customerMessage('msg-9', '2026-08-13T08:09:00.000Z', {
      receiptStatus: 'read',
    })

    const next = applyNewestPage(restored(), [read], viewer)

    expect(next.messages.map((each) => each.receiptStatus)).toEqual(['sent', 'read'])
  })

  /**
   * Enough was said while the phone was away that a whole page of it is new.
   * What was held is a fragment of a thread this page no longer continues, and
   * keeping it would draw one run of history straight into another with
   * unfetched messages between them and no way to ask for them.
   */
  it('starts the thread over when the page does not continue what is held', () => {
    const page = [
      customerMessage('msg-90', '2026-08-14T08:00:00.000Z'),
      customerMessage('msg-91', '2026-08-14T08:01:00.000Z'),
    ]

    expect(applyNewestPage(restored(), page, viewer)).toEqual({
      messages: page,
      unsent: [],
      hasMore: true,
      cursor: 'msg-90',
    })
  })

  it('keeps a message still on its way when it starts the thread over', () => {
    const sending = beginSend(restored(), customerMessage('local-1', '2026-08-13T08:11:00.000Z'))

    const next = applyNewestPage(
      sending,
      [customerMessage('msg-90', '2026-08-14T08:00:00.000Z')],
      viewer,
    )

    expect(next.unsent).toHaveLength(1)
  })

  it('empties a thread whose newest page has nothing in it', () => {
    expect(applyNewestPage(restored(), [], viewer)).toEqual({
      messages: [],
      unsent: [],
      hasMore: false,
      cursor: undefined,
    })
  })

  it('withholds a system notice from a Customer on the way in', () => {
    const page = [
      customerMessage('msg-9', '2026-08-13T08:09:00.000Z'),
      customerMessage('msg-10', '2026-08-13T08:10:00.000Z', { messageType: 'system' }),
    ]

    const next = applyNewestPage(restored(), page, viewer)

    expect(next.messages.map((each) => each.id)).toEqual(['msg-8', 'msg-9'])
  })
})
