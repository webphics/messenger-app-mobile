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
import { parseConversationReassigned, parseMessageCreated } from '@/lib/realtime-events'
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
