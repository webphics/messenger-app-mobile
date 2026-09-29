import {
  findOffersConversation,
  isConversationUnread,
  mergeConversation,
  sortConversations,
  totalUnread,
  withConversationRead,
  withIncomingMessage,
  withoutConversation,
  withReassignment,
} from '@/lib/conversation-list'
import { parseMessageCreated } from '@/lib/realtime-events'
import type { Reassignment, ReassignmentReason } from '@/lib/conversation-list'
import type { Conversation, CustomerMessage, StaffConversation, StaffMessage } from '@/lib/types'

/**
 * The list reducers: what a fetch, a socket event and a mark-as-read each do to
 * the rows and their order. The thread's own reducers are tested next door in
 * `lib/thread-state.test.ts`.
 */

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
    editedAt: null,
    editableUntil: null,
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

describe('isConversationUnread', () => {
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
})

describe('mergeConversation', () => {
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
  ] as const)('%s', (_name, held, arriving, expected) => {
    const merged = mergeConversation(
      [conversation({ id: 'a', unreadCount: held })],
      conversation({ id: 'a', unreadCount: arriving }),
    )
    expect(merged[0]?.unreadCount).toBe(expected)
  })
})

describe('withConversationRead', () => {
  const list = [
    conversation({ id: 'a', unreadCount: 2, lastMessageRead: false }),
    conversation({ id: 'b', unreadCount: 5, lastMessageRead: false }),
  ]

  test.each([
    ['a row the API declined to count, unread by receipt', null, false],
    ['a row counted at zero the receipt still calls unread', 0, false],
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

  test('answers the list it was given for a row that was already read', () => {
    const held = [...list, conversation({ id: 'read', unreadCount: 0, lastMessageRead: true })]
    expect(withConversationRead(held, 'read')).toBe(held)
  })
})

describe('findOffersConversation', () => {
  test('finds the group by its title, ignoring case and surrounding space', () => {
    const offers = conversation({ id: 'g1', type: 'group', title: '  offers ' })
    expect(findOffersConversation([conversation(), offers])?.id).toBe('g1')
  })

  test('does not mistake a support thread titled Offers for the group', () => {
    const staffRow = conversation({ id: 's1', type: 'support_dm', title: 'Offers' })
    expect(findOffersConversation([staffRow])).toBeUndefined()
  })
})

describe('totalUnread', () => {
  test.each([
    ['an uncounted row the viewer sent last is worth nothing', false, true, 0],
    ['an uncounted row unread by receipt is worth at least one', false, false, 1],
  ] as const)('%s', (_name, lastMessageRead, lastMessageMine, expected) => {
    expect(
      totalUnread([conversation({ unreadCount: null, lastMessageRead, lastMessageMine })]),
    ).toBe(expected)
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

  test('a reaction re-broadcast on the newest message leaves the row exactly as it was', () => {
    // What the API broadcasts when somebody reacts: the reacted message, whole,
    // on `message.created`. Read as an arrival it would drag the row's preview
    // and order around, so a timestamp no newer than the row's is not news.
    const reacted = messageCreatedEvent('a', '2026-08-13T08:00:00.000Z')

    expect(withIncomingMessage(rows, 'conv-1', reacted.message, 'customer-1')).toBe(rows)
  })

  describe('a staff row', () => {
    const staffRows = [conversation({ id: 'conv-1', unreadCount: 2 })]

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

    test('the onboarding welcome counts, as the API counts it', () => {
      const welcome = staffMessage('m1', '2026-08-13T10:00:00.000Z', {
        messageType: 'system',
        addressedToCustomer: true,
        body: 'Welcome to JoyChat.',
        sender: { id: 'customer-1', name: 'Mina', role: 'customer' },
      })

      expect(withIncomingMessage(staffRows, 'conv-1', welcome, 'agent-1')[0]).toMatchObject({
        unreadCount: 3,
        lastMessageRead: false,
      })
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
  })

  describe('a membership that was revoked', () => {
    test('drops the row, because the thread is in an organization the viewer has left', () => {
      const next = withReassignment(
        [supportRow(), supportRow({ id: 'other' })],
        event({ reason: 'membership_revoked', assignee: null }),
      )

      expect(next.map((row) => row.id)).toEqual(['other'])
    })
  })

  describe('an event with nothing to apply', () => {
    test('answers the same list for a Customer’s row, which carries no assignment', () => {
      // A Customer is never sent this event; the guard is here because the list
      // this walks holds every shape the API sends.
      const list = [conversation({ id: 'conv-1', type: 'support_dm' })]
      expect(withReassignment(list, event())).toBe(list)
    })
  })
})

describe('withoutConversation', () => {
  test('drops the conversation the server says is gone', () => {
    const rows = [conversation({ id: 'conv-1' }), conversation({ id: 'conv-2' })]
    expect(withoutConversation(rows, 'conv-1').map((row) => row.id)).toEqual(['conv-2'])
  })
})
