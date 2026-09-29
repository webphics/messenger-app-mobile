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
  findUnsent,
  isMessageVisibleTo,
  isOutgoing,
  mergeMessages,
  messageSenderName,
  deliveryStates,
  threadContinues,
  threadMessages,
  visibleMessages,
} from '@/lib/thread-state'
import { parseMessageCreated } from '@/lib/realtime-events'
import type { ThreadState, UnsentMessage } from '@/lib/thread-state'
import type { CustomerMessage, Message, StaffMessage } from '@/lib/types'

/**
 * The thread reducers: what a page, a socket event and a send each do to the
 * Messages on screen. The list's own reducers are tested next door in
 * `lib/conversation-list.test.ts`.
 */

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
    editedAt: null,
    editableUntil: null,
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

describe('isMessageVisibleTo', () => {
  test('a Customer sees a system notice in a group, where it is not the internal assignment record', () => {
    expect(isMessageVisibleTo('customer', 'group', { messageType: 'system' })).toBe(true)
  })

  test('a Customer never sees an internal system notice in their Support DM', () => {
    expect(isMessageVisibleTo('customer', 'support_dm', { messageType: 'system' })).toBe(false)
  })

  test('a Customer does see a system notice addressed to them', () => {
    expect(
      isMessageVisibleTo('customer', 'support_dm', {
        messageType: 'system',
        addressedToCustomer: true,
      }),
    ).toBe(true)
  })
})

describe('visibleMessages', () => {
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
})

describe('applyMessagePage', () => {
  const viewer = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const

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
})

describe('isOutgoing', () => {
  test('a Customer message not from the company is theirs', () => {
    expect(isOutgoing(customerMessage('a', 'x', { fromCompany: false }), 'cust-1')).toBe(true)
  })

  test('a staff message is outgoing only for its sender', () => {
    const message = staffMessage('a', 'x')
    expect(isOutgoing(message, 'agent-1')).toBe(true)
    expect(isOutgoing(message, 'agent-2')).toBe(false)
  })

  test('the company persona a Customer reads in a group is never theirs', () => {
    const message = staffMessage('a', 'x', {
      sender: { id: 'company:org-1', name: 'Acme Support', role: 'agent' },
    })
    expect(isOutgoing(message, 'cust-1')).toBe(false)
    expect(messageSenderName(message)).toBe('Acme Support')
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
      editedAt: null,
      editableUntil: null,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'sent',
      fromCompany: false,
    })
  })

})

describe('beginSend', () => {
  const author = { id: 'cust-1', name: 'Ada Poole', role: 'customer' } as const

  function draft(id: string, at: string) {
    return draftMessage({ id, body: id, author, sentAt: at })
  }

  test('sending again re-marks the message rather than stacking a second copy', () => {
    const message = draft('local-1', '2026-08-13T08:00:00.000Z')
    const failed = failSend(beginSend(emptyThread(), message), 'local-1')

    expect(beginSend(failed, message).unsent).toEqual([{ message, state: 'sending' }])
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

  test('a refresh that already brought the stored message does not show it twice', () => {
    const viewer = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const
    const raced = applyMessagePage(beginSend(emptyThread(), echo), [stored], viewer)
    const state = applySentMessage(raced, 'local-1', stored)

    expect(state.messages.map((m) => m.id)).toEqual(['msg-2'])
    expect(state.unsent).toEqual([])
  })

  test('an answer for a message no longer held only adds the stored message', () => {
    const state = applySentMessage(emptyThread(), 'local-1', stored)

    expect(state.messages.map((m) => m.id)).toEqual(['msg-2'])
    expect(state.unsent).toEqual([])
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
      { id: 'customer-1', role: 'customer', conversationType: 'support_dm' },
    )
    const state = beginSend(
      held,
      draftMessage({ id: 'local-1', body: 'Hi', author, sentAt: '2026-08-13T08:02:00.000Z' }),
    )

    expect(threadMessages(state).map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'local-1'])
  })
})

/**
 * The socket half of the same rules the REST half is tested against above.
 *
 * The payloads are the API's own, read through `lib/realtime-events` so these
 * are the objects the socket layer actually hands the merge — a synthetic event
 * end to end, with no socket and no React anywhere near it.
 */

describe('applyIncomingMessage', () => {
  test('the API’s duplicate of one message is still one message', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z')

    const once = applyIncomingMessage(emptyThread(), event.message, CUSTOMER_VIEWER)
    const twice = applyIncomingMessage(once, event.message, CUSTOMER_VIEWER)

    expect(twice.messages.map((m) => m.id)).toEqual(['b'])
  })

  test('a Customer’s Support DM never shows an assignment notice that arrives live', () => {
    const event = messageCreatedEvent('b', '2026-08-13T08:01:00.000Z', { messageType: 'system' })
    const state = emptyThread()

    expect(applyIncomingMessage(state, event.message, CUSTOMER_VIEWER)).toBe(state)
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

/**
 * The other half of the echo rule: a Message that did not get away, Restored
 * from the Outbox into a session that has told this person nothing about it, and
 * a fetch that turns out to be carrying the copy the API kept all along.
 *
 * What separates it from a send that failed while somebody watched is a property
 * of the entry — `restored` — rather than a reading of the bubble, which is why
 * the two tables below can be tables at all.
 */

describe('a Restored Outbox entry the API turns out to hold', () => {
  const viewer = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const
  const author = { id: 'customer-1', name: 'QA', role: 'customer' as const }

  function typed(id: string, body: string, sentAt: string): Message {
    return draftMessage({ id, body, author, sentAt })
  }

  /** A thread as it comes back off the disk: history, and what never got away. */
  function restoredThread(unsent: UnsentMessage[], messages: Message[] = []): ThreadState {
    return { ...emptyThread(), messages, unsent }
  }

  function restoredEntry(body: string, sentAt = '2026-08-13T08:00:00.000Z'): UnsentMessage {
    return { message: typed('local-1', body, sentAt), state: 'failed', restored: true }
  }

  /** The API's copy of it, under the id the server gave it. */
  function confirmed(body: string, createdAt: string): CustomerMessage {
    return customerMessage('server-1', createdAt, { body, fromCompany: false })
  }

  test('is resolved by the page carrying it, so the thread draws it once', () => {
    const next = applyNewestPage(
      restoredThread([restoredEntry('Any update?')]),
      [confirmed('Any update?', '2026-08-13T08:00:01.000Z')],
      viewer,
    )

    expect(next.unsent).toEqual([])
    expect(threadMessages(next).map((message) => message.id)).toEqual(['server-1'])
  })

  /**
   * The rule `withoutEcho` already documented, unweakened. A send that failed in
   * front of the person is a bubble they were told about, and taking it away on
   * the strength of a match would leave them nothing to retry. One still
   * uploading has no copy on the server for anything to be an echo of, and one
   * still in flight has an answer of its own coming.
   */
  test.each([
    ['a send still in flight', 'sending' as const],
    ['a send still uploading', 'uploading' as const],
    ['a send that failed in this session', 'failed' as const],
  ])('leaves %s where the person can see it', (_name, delivery) => {
    const held = restoredThread([
      { message: typed('local-1', 'Any update?', '2026-08-13T08:00:00.000Z'), state: delivery },
    ])

    const next = applyNewestPage(
      held,
      [confirmed('Any update?', '2026-08-13T08:00:01.000Z')],
      viewer,
    )

    expect(next.unsent.map((one) => one.message.id)).toEqual(['local-1'])
  })

  /**
   * A Restored entry somebody has tapped *Retry* on is an ordinary send of this
   * session from that moment: they watched it go, and they were told when it did
   * not arrive.
   */
  test('a Restored entry retried and failed again keeps its place', () => {
    const entry = restoredEntry('Any update?')
    const retried = failSend(beginSend(restoredThread([entry]), entry.message), 'local-1')

    expect(retried.unsent[0].restored).toBeUndefined()
    expect(
      applyNewestPage(retried, [confirmed('Any update?', '2026-08-13T08:00:01.000Z')], viewer)
        .unsent,
    ).toHaveLength(1)
  })

  /** Everything the socket path already refuses to match on, refused here too. */
  test.each([
    [
      'a message from somebody else',
      customerMessage('server-1', '2026-08-13T08:00:01.000Z', {
        body: 'Any update?',
        fromCompany: true,
      }),
    ],
    [
      'a message that says something else',
      customerMessage('server-1', '2026-08-13T08:00:01.000Z', {
        body: 'Something else',
        fromCompany: false,
      }),
    ],
  ])('is not resolved by %s', (_name, message) => {
    const next = applyNewestPage(restoredThread([restoredEntry('Any update?')]), [message], viewer)

    expect(next.unsent).toHaveLength(1)
  })

  /**
   * The one thing a page could otherwise be wrong about: history that reads the
   * same, which is somebody saying *Thanks* twice a fortnight apart. The copy of
   * an Outbox entry is a Message this device has never held — that is why the
   * entry is still there — so a Message it is holding already is not it.
   */
  test('is not resolved by history this device is already holding', () => {
    const fortnightAgo = customerMessage('server-9', '2026-07-30T09:00:00.000Z', {
      body: 'Thanks',
      fromCompany: false,
    })
    const held = restoredThread([restoredEntry('Thanks')], [fortnightAgo])

    const next = applyMessagePage(held, [fortnightAgo], viewer)

    expect(next.unsent).toHaveLength(1)
  })

  /**
   * The copy the API kept can be older than Messages this device went on to
   * receive before the process died — the send is what stopped, not the socket.
   * A rule that compared times would refuse this one for good.
   */
  test('is resolved by a copy older than the newest Message the thread holds', () => {
    const held = restoredThread(
      [restoredEntry('Thanks', '2026-08-13T08:00:00.000Z')],
      [customerMessage('server-9', '2026-08-13T08:05:00.000Z', { fromCompany: true })],
    )

    const next = applyMessagePage(
      held,
      [confirmed('Thanks', '2026-08-13T08:00:01.000Z')],
      viewer,
    )

    expect(next.unsent).toEqual([])
  })

  /**
   * A page is read for this after the visibility rule has run, not before. An
   * entry resolved by a Message the viewer may not see would be a bubble taken
   * away with nothing drawn in its place.
   */
  test('is not resolved by a copy this viewer is not shown', () => {
    const notice = customerMessage('server-1', '2026-08-13T08:00:01.000Z', {
      body: 'Any update?',
      fromCompany: false,
      messageType: 'system',
    })

    const next = applyNewestPage(restoredThread([restoredEntry('Any update?')]), [notice], viewer)

    expect(next.unsent).toHaveLength(1)
    expect(next.messages).toEqual([])
  })

  test('one arriving copy resolves one entry, not both that say the same', () => {
    const both = restoredThread([
      restoredEntry('Thanks', '2026-08-13T08:00:00.000Z'),
      {
        message: typed('local-2', 'Thanks', '2026-08-13T08:00:01.000Z'),
        state: 'failed',
        restored: true,
      },
    ])

    const next = applyNewestPage(both, [confirmed('Thanks', '2026-08-13T08:00:02.000Z')], viewer)

    expect(next.unsent.map((entry) => entry.message.id)).toEqual(['local-2'])
  })

  /**
   * A staged Attachment is a device URI and the API's copy names a stored
   * object, so the two attachment lists cannot agree and the match fails safe.
   * The bubble that is kept is one somebody can send again; the one this would
   * have dropped is gone.
   */
  test('is kept when its photo is still the one the picker staged', () => {
    const staged = {
      type: 'image/jpeg',
      url: 'file:///tmp/IMG_0001.jpg',
      fileName: 'IMG_0001.jpg',
      size: 2048,
      durationSeconds: null,
      waveform: null,
    }
    const held = restoredThread([
      {
        message: draftMessage({
          id: 'local-1',
          body: '',
          author,
          sentAt: '2026-08-13T08:00:00.000Z',
          attachments: [staged],
        }),
        state: 'failed',
        restored: true,
      },
    ])

    const next = applyNewestPage(
      held,
      [
        customerMessage('server-1', '2026-08-13T08:00:01.000Z', {
          body: '',
          fromCompany: false,
          messageType: 'media',
          attachments: [{ ...staged, url: '/uploads/chat/9f1c.jpg' }],
        }),
      ],
      viewer,
    )

    expect(next.unsent).toHaveLength(1)
  })

  test('a page that starts the thread over still resolves what it confirms', () => {
    const held = restoredThread(
      [restoredEntry('Any update?')],
      [customerMessage('server-0', '2026-07-01T08:00:00.000Z', { fromCompany: false })],
    )

    const next = applyNewestPage(
      held,
      [confirmed('Any update?', '2026-08-13T08:00:01.000Z')],
      viewer,
    )

    expect(next.messages.map((message) => message.id)).toEqual(['server-1'])
    expect(next.unsent).toEqual([])
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
})

describe('applyNewestPage', () => {
  const viewer = { id: 'customer-1', role: 'customer', conversationType: 'support_dm' } as const

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

  it('empties a thread whose newest page has nothing in it', () => {
    expect(applyNewestPage(restored(), [], viewer)).toEqual({
      messages: [],
      unsent: [],
      hasMore: false,
      cursor: undefined,
    })
  })
})
