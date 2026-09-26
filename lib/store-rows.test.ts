import {
  fromConversationRows,
  fromMessageRows,
  fromOrganizationRows,
  fromOutboxRows,
  messageOrder,
  toConversationRows,
  toMessageRows,
  toOrganizationRows,
  toOutboxRows,
  type ConversationRow,
  type MessageRow,
  type OutboxRow,
  type ThreadPaging,
} from '@/lib/store-rows'
import { isStaffConversation, isStaffMessage } from '@/lib/types'
import type {
  Conversation,
  CustomerConversation,
  CustomerMessage,
  Message,
  StaffConversation,
  StaffMessage,
} from '@/lib/types'

function customerConversation(overrides: Partial<CustomerConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    // Present for the reason `writePolicy` is on the staff builder below: the
    // round trip through `parseConversation` always supplies it, even where the
    // payload it read did not.
    communityId: null,
    type: 'support_dm',
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    // Present for the same reason: the parser supplies `access` on every row, as
    // unknown where the payload carried none.
    access: { kind: 'unknown' },
    ...overrides,
  } as Conversation
}

function staffConversation(overrides: Partial<StaffConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    communityId: null,
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Ada Lovelace' },
    assignedAgent: { id: 'agent-1', name: 'Grace Hopper' },
    otherUser: null,
    members: [],
    labels: [{ id: 'label-1', name: 'Billing', color: 'amber', archived: false }],
    // Null and `true` respectively: a support DM carries no write policy at
    // all, and the API resolves `canWrite` to `true` outside a group. Present
    // here because the round trip through `parseConversation` always supplies
    // them, even where the payload it read did not.
    writePolicy: null,
    canWrite: true,
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 3,
    access: { kind: 'unknown' },
    ...overrides,
  } as Conversation
}

/** A row as SQLite would hand it back, with the columns a test is not about filled in. */
function row(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'conv-1',
    owner_id: 'viewer-1',
    payload: JSON.stringify(customerConversation()),
    has_more: 1,
    cursor: null,
    ...overrides,
  }
}

function rowFor(conversation: Conversation): unknown {
  return row({ id: conversation.id, payload: JSON.stringify(conversation) })
}

const NO_PAGING = new Map<string, ThreadPaging>()

describe('toConversationRows', () => {
  it('writes one row per conversation, under the viewer it belongs to', () => {
    const rows = toConversationRows('viewer-1', [
      customerConversation({ id: 'conv-1' }),
      customerConversation({ id: 'conv-2' }),
    ])

    expect(rows.map((each) => [each.id, each.owner_id])).toEqual([
      ['conv-1', 'viewer-1'],
      ['conv-2', 'viewer-1'],
    ])
  })

  /**
   * A conversation nobody has opened has no paging of its own, and the defaults
   * written here are the ones `emptyThread` would give it: there is more history
   * to ask for, and nowhere in particular to ask from.
   */
  it('defaults the paging of a thread nobody has read back through', () => {
    const [only] = toConversationRows('viewer-1', [customerConversation()])

    expect(only).toMatchObject({ has_more: 1, cursor: null })
  })

  it('carries the paging of a thread that has been read back through', () => {
    const paging = new Map<string, ThreadPaging>([['conv-1', { hasMore: false, cursor: 'msg-40' }]])

    const [only] = toConversationRows('viewer-1', [customerConversation()], paging)

    expect(only).toMatchObject({ has_more: 0, cursor: 'msg-40' })
  })

  /**
   * The one thing a row carries that the payload does not already say: Eviction
   * ranks threads by it, and reading it out of the JSON on every sweep is what
   * a column is for.
   */
  it('writes the activity Eviction ranks by, as a number', () => {
    const [only] = toConversationRows('viewer-1', [
      customerConversation({ lastMessageAt: '2026-08-13T08:00:00.000Z' }),
    ])

    expect(only.activity_at).toBe(Date.parse('2026-08-13T08:00:00.000Z'))
  })

  it('writes no activity for a conversation nobody has written in', () => {
    const [only] = toConversationRows('viewer-1', [customerConversation({ lastMessageAt: null })])

    expect(only.activity_at).toBe(0)
  })

  it('writes no rows for an empty list', () => {
    expect(toConversationRows('viewer-1', [])).toEqual([])
  })
})

describe('fromConversationRows', () => {
  it('reads nothing back out of nothing', () => {
    expect(fromConversationRows([])).toEqual({ conversations: [], paging: new Map() })
  })

  it('gives back the conversations that were written', () => {
    const written = [customerConversation({ id: 'conv-1' }), customerConversation({ id: 'conv-2' })]

    const { conversations } = fromConversationRows(toConversationRows('viewer-1', written))

    expect(conversations).toEqual(written)
  })

  /**
   * The row is the API's own payload, so both shapes have to survive the trip
   * intact — a staff row read back as a Customer's would lose the assignee, the
   * labels and the presence the staff screens read off it.
   */
  it('keeps a staff conversation a staff conversation', () => {
    const { conversations } = fromConversationRows(
      toConversationRows('viewer-1', [staffConversation()]),
    )

    expect(conversations[0]).toEqual(staffConversation())
    expect(isStaffConversation(conversations[0])).toBe(true)
  })

  it('keeps a Customer conversation a Customer conversation', () => {
    const { conversations } = fromConversationRows(
      toConversationRows('viewer-1', [customerConversation()]),
    )

    expect(isStaffConversation(conversations[0])).toBe(false)
  })

  /** The badge on the tab bar is this number, and it is drawn before any fetch answers. */
  it('keeps the Unread count and the read flag', () => {
    const { conversations } = fromConversationRows(
      toConversationRows('viewer-1', [staffConversation({ unreadCount: 7, lastMessageRead: false })]),
    )

    expect(conversations[0]).toMatchObject({ unreadCount: 7, lastMessageRead: false })
  })

  it('gives back the paging that was written', () => {
    const paging = new Map<string, ThreadPaging>([['conv-1', { hasMore: false, cursor: 'msg-40' }]])

    const restored = fromConversationRows(
      toConversationRows('viewer-1', [customerConversation()], paging),
    )

    expect(restored.paging.get('conv-1')).toEqual({ hasMore: false, cursor: 'msg-40' })
  })

  it('reports a thread nobody has paged as having history to ask for', () => {
    const restored = fromConversationRows(
      toConversationRows('viewer-1', [customerConversation()], NO_PAGING),
    )

    expect(restored.paging.get('conv-1')).toEqual({ hasMore: true, cursor: undefined })
  })

  /**
   * The same order the list shows, from the same function the list sorts with —
   * so a Restored list and a fetched one cannot drift apart.
   */
  it('orders by activity, whatever order the rows came out in', () => {
    const rows = [
      rowFor(customerConversation({ id: 'old', lastMessageAt: '2026-08-01T00:00:00.000Z' })),
      rowFor(customerConversation({ id: 'new', lastMessageAt: '2026-08-20T00:00:00.000Z' })),
    ]

    const { conversations } = fromConversationRows(rows)

    expect(conversations.map((each) => each.id)).toEqual(['new', 'old'])
  })

  /** One unreadable row is not grounds for showing a person an empty inbox. */
  it('drops a row whose payload is not JSON and keeps the rest', () => {
    const rows = [
      row({ id: 'broken', payload: '{"id": "broken"' }),
      rowFor(customerConversation({ id: 'conv-2' })),
    ]

    const { conversations } = fromConversationRows(rows)

    expect(conversations.map((each) => each.id)).toEqual(['conv-2'])
  })

  it('drops a row whose payload is JSON but not a conversation', () => {
    expect(fromConversationRows([row({ payload: '{"nothing": true}' })]).conversations).toEqual([])
    expect(fromConversationRows([row({ payload: 'null' })]).conversations).toEqual([])
  })

  it('drops a row with no payload column at all', () => {
    expect(fromConversationRows([{ id: 'conv-1' }, null, 'nonsense']).conversations).toEqual([])
  })

  /**
   * A cursor this build cannot read is a thread that pages from the top, which
   * costs a request. Dropping the conversation over it would cost a row.
   */
  it('falls back to the default paging rather than dropping a row over it', () => {
    const restored = fromConversationRows([row({ has_more: null, cursor: 42 })])

    expect(restored.conversations).toHaveLength(1)
    expect(restored.paging.get('conv-1')).toEqual({ hasMore: true, cursor: undefined })
  })

  /** A row type that never escapes this module still has to describe what is written. */
  it('reads back a row typed as the table declares it', () => {
    const typed: ConversationRow = toConversationRows('viewer-1', [customerConversation()])[0]

    expect(fromConversationRows([typed]).conversations).toHaveLength(1)
  })

  /*
   * `access` rides in the payload column like every other field the parser
   * reads, so persisting it needed no schema change and no version bump. A
   * version bump deletes the database, the Outbox with it.
   */
  it('keeps the access a conversation was written with', () => {
    const access = {
      write: {
        state: 'read_only' as const,
        reason: 'must_take_over' as const,
        holder: { id: 'agent-1', name: 'Grace Hopper' },
        wayOut: 'take_over' as const,
      },
      actions: { editMessages: false, engage: false, takeOver: true, transfer: false, close: false, reopen: false, setPriority: true, manageLabels: true, readNotes: true, writeNotes: false, setWritePolicy: false, setJoinPolicy: false, deleteMessages: true, deleteConversation: true },
    }

    const { conversations } = fromConversationRows(
      toConversationRows('viewer-1', [staffConversation({ access })]),
    )

    expect(conversations[0].access).toEqual(access)
  })

  /*
   * A row written by a build from before `access` existed. It still draws, and
   * reads as unknown, so the composer says it is updating until the launch
   * refetch replaces the row.
   */
  it('reads a row written without access as unknown', () => {
    const { access: _dropped, ...older } = staffConversation() as StaffConversation

    const { conversations } = fromConversationRows([rowFor(older as Conversation)])

    expect(conversations).toHaveLength(1)
    expect(conversations[0].access).toEqual({ kind: 'unknown' })
  })
})

describe('organization rows', () => {
  it('write one row per organization, under the viewer it was fetched for', () => {
    const rows = toOrganizationRows(
      'viewer-1',
      new Map([
        ['org-1', 'Acme Corp'],
        ['org-2', 'Other Ltd'],
      ]),
    )

    expect(rows).toEqual([
      { id: 'org-1', owner_id: 'viewer-1', name: 'Acme Corp' },
      { id: 'org-2', owner_id: 'viewer-1', name: 'Other Ltd' },
    ])
  })

  it('give back the names that were written', () => {
    const names = new Map([['org-1', 'Acme Corp']])

    expect([...fromOrganizationRows(toOrganizationRows('viewer-1', names))]).toEqual([...names])
  })

  it('read nothing back out of nothing', () => {
    expect(fromOrganizationRows([]).size).toBe(0)
    expect(toOrganizationRows('viewer-1', new Map())).toEqual([])
  })

  /**
   * A name is the whole point of the row. One that is missing or empty would
   * title a thread with nothing, where a row that is simply absent lets
   * `conversationTitle` fall back to `Support`.
   */
  it.each([
    ['no name at all', { id: 'org-1' }],
    ['an empty name', { id: 'org-1', name: '' }],
    ['no id', { name: 'Acme Corp' }],
    ['a name that is not text', { id: 'org-1', name: 42 }],
    ['nothing readable at all', null],
  ])('drops a row with %s', (_label, row) => {
    expect(fromOrganizationRows([row]).size).toBe(0)
  })
})

function customerMessage(
  id: string,
  createdAt: string,
  overrides: Partial<CustomerMessage> = {},
): Message {
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
): Message {
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
    sender: { id: 'agent-1', name: 'Grace Hopper', role: 'agent' },
    ...overrides,
  }
}

/** A Message row as SQLite would hand it back, with what a test is not about filled in. */
function messageRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    owner_id: 'viewer-1',
    created_at: Date.parse('2026-08-13T08:00:00.000Z'),
    payload: JSON.stringify(customerMessage('msg-1', '2026-08-13T08:00:00.000Z')),
    ...overrides,
  }
}

describe('messageOrder', () => {
  it('is the timestamp the column orders on', () => {
    expect(messageOrder('2026-08-13T08:00:00.000Z')).toBe(Date.parse('2026-08-13T08:00:00.000Z'))
  })

  /**
   * A `NaN` would reach SQLite as null and order unpredictably against every
   * other row. A Message with an unreadable date is already broken; what must
   * not happen is that it takes the page around it with it.
   */
  it('sorts a timestamp it cannot read to the beginning rather than to nowhere', () => {
    expect(messageOrder('the day before yesterday')).toBe(0)
  })
})

describe('toMessageRows', () => {
  it('writes one row per Message, under the viewer and the thread it belongs to', () => {
    const rows = toMessageRows('viewer-1', 'conv-1', [
      customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(rows.map((each) => [each.id, each.conversation_id, each.owner_id])).toEqual([
      ['msg-1', 'conv-1', 'viewer-1'],
      ['msg-2', 'conv-1', 'viewer-1'],
    ])
  })

  it('carries the timestamp as the column that orders it', () => {
    const [only] = toMessageRows('viewer-1', 'conv-1', [
      customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
    ])

    expect(only.created_at).toBe(Date.parse('2026-08-13T08:00:00.000Z'))
  })

  it('writes no rows for a thread with nothing in it', () => {
    expect(toMessageRows('viewer-1', 'conv-1', [])).toEqual([])
  })
})

describe('fromMessageRows', () => {
  it('reads nothing back out of nothing', () => {
    expect(fromMessageRows([])).toEqual([])
  })

  it('gives back the Messages that were written', () => {
    const written = [
      customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
    ]

    expect(fromMessageRows(toMessageRows('viewer-1', 'conv-1', written))).toEqual(written)
  })

  /**
   * The row is the API's own payload, so both shapes have to survive the trip —
   * a staff Message carries a `sender` and a Customer's carries `fromCompany`,
   * and a bubble draws a different thing for each.
   */
  it('keeps a staff Message a staff Message', () => {
    const written = staffMessage('msg-1', '2026-08-13T08:00:00.000Z')

    const [read] = fromMessageRows(toMessageRows('viewer-1', 'conv-1', [written]))

    expect(isStaffMessage(read)).toBe(true)
    expect(read).toEqual(written)
  })

  it('keeps what a Message is carrying', () => {
    const written = customerMessage('msg-1', '2026-08-13T08:00:00.000Z', {
      body: 'Here it is',
      messageType: 'media',
      replyTo: { id: 'msg-0', preview: 'Where is it?' },
      reactions: [{ emoji: '\u{1F44D}', userId: 'agent-1' }],
      attachments: [
        {
          type: 'image/jpeg',
          url: 'https://cdn.example.com/a.jpg',
          fileName: 'a.jpg',
          size: 1024,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    expect(fromMessageRows(toMessageRows('viewer-1', 'conv-1', [written]))).toEqual([written])
  })

  /*
   * The row is the parsed Message's own JSON, so the edit window rides in it
   * with no schema change and no version bump. A version bump deletes the
   * database, the Outbox with it.
   */
  it('keeps the edit window a Message was written with', () => {
    const written = staffMessage('msg-1', '2026-08-13T08:00:00.000Z', {
      editableUntil: '2026-08-13T08:15:00.000Z',
    })

    const [read] = fromMessageRows(toMessageRows('viewer-1', 'conv-1', [written]))

    expect(read.editableUntil).toBe('2026-08-13T08:15:00.000Z')
    expect(read).toEqual(written)
  })

  it('reads a row written without an edit window as no Edit', () => {
    const { editableUntil: _dropped, ...older } = customerMessage('msg-1', '2026-08-13T08:00:00.000Z', {
      editableUntil: '2026-08-13T08:15:00.000Z',
    })

    const [read] = fromMessageRows([messageRow({ payload: JSON.stringify(older) })])

    expect(read.editableUntil).toBeNull()
  })

  /**
   * Oldest first, whatever order the rows arrived in: a page is read back
   * newest-first so that `LIMIT` takes the page nearest the one on screen, and
   * the thread it joins is ordered the other way.
   */
  it('reads a page back oldest first', () => {
    const rows = toMessageRows('viewer-1', 'conv-1', [
      customerMessage('msg-3', '2026-08-13T08:02:00.000Z'),
      customerMessage('msg-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('msg-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(fromMessageRows(rows).map((each) => each.id)).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })

  it('drops a row it cannot read rather than the page it is in', () => {
    const rows = [
      messageRow({ id: 'msg-1' }),
      messageRow({ id: 'msg-2', payload: '{"id":' }),
      messageRow({
        id: 'msg-3',
        payload: JSON.stringify(customerMessage('msg-3', '2026-08-13T08:02:00.000Z')),
      }),
    ]

    expect(fromMessageRows(rows).map((each) => each.id)).toEqual(['msg-1', 'msg-3'])
  })

  it('drops a row whose payload is not a Message', () => {
    expect(fromMessageRows([messageRow({ payload: JSON.stringify({ id: 'msg-1' }) })])).toEqual([])
  })

  it('drops a row with no payload at all', () => {
    expect(fromMessageRows([{ id: 'msg-1' } as Partial<MessageRow>, null])).toEqual([])
  })
})

/**
 * The two halves of what a restart has to know about a thread: whether asking
 * the API for another page is still worth a request, and where to ask from.
 */
describe('the paging a thread is written with', () => {
  it('comes back the way it went in', () => {
    const paging = new Map<string, ThreadPaging>([['conv-1', { hasMore: false, cursor: 'msg-40' }]])

    const restored = fromConversationRows(
      toConversationRows('viewer-1', [customerConversation()], paging),
    )

    expect(restored.paging.get('conv-1')).toEqual({ hasMore: false, cursor: 'msg-40' })
  })

  it('comes back as the defaults for a thread nobody has read back through', () => {
    const restored = fromConversationRows(toConversationRows('viewer-1', [customerConversation()]))

    expect(restored.paging.get('conv-1')).toEqual({ hasMore: true, cursor: undefined })
  })
})

/** An Outbox row as SQLite would hand it back, with what a test is not about filled in. */
function outboxRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'local-1',
    conversation_id: 'conv-1',
    owner_id: 'viewer-1',
    created_at: Date.parse('2026-08-13T08:00:00.000Z'),
    payload: JSON.stringify(customerMessage('local-1', '2026-08-13T08:00:00.000Z')),
    ...overrides,
  }
}

describe('toOutboxRows', () => {
  it('writes one row per Unsent Message, under the viewer and the thread it belongs to', () => {
    const rows = toOutboxRows('viewer-1', 'conv-1', [
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('local-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(rows.map((row) => [row.id, row.conversation_id, row.owner_id])).toEqual([
      ['local-1', 'conv-1', 'viewer-1'],
      ['local-2', 'conv-1', 'viewer-1'],
    ])
  })

  it('carries the timestamp as the column that orders it', () => {
    const [row] = toOutboxRows('viewer-1', 'conv-1', [
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
    ])

    expect(row.created_at).toBe(Date.parse('2026-08-13T08:00:00.000Z'))
  })

  it('writes no rows for a thread with nothing on its way out', () => {
    expect(toOutboxRows('viewer-1', 'conv-1', [])).toEqual([])
  })
})

describe('fromOutboxRows', () => {
  it('reads nothing back out of nothing', () => {
    expect(fromOutboxRows([])).toEqual([])
  })

  it('gives back the Messages that were written', () => {
    const written = [
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('local-2', '2026-08-13T08:01:00.000Z'),
    ]

    expect(fromOutboxRows(toOutboxRows('viewer-1', 'conv-1', written))).toEqual([
      { message: written[0], state: 'failed', restored: true },
      { message: written[1], state: 'failed', restored: true },
    ])
  })

  /**
   * The mark that tells a Restored entry from a send that failed while somebody
   * watched. Nothing on screen shows it — both say *Not sent* — and what reads
   * it is the rule that resolves one the API turns out to hold; see
   * `UnsentMessage` in `lib/thread-state`.
   */
  it('marks every row Restored, because a row is all this device has been told', () => {
    const rows = toOutboxRows('viewer-1', 'conv-1', [
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('local-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(fromOutboxRows(rows).map((entry) => entry.restored)).toEqual([true, true])
  })

  /**
   * The whole of the state mapping. A send still in flight when the process died
   * did not survive the thing that was sending it, and nobody knows whether it
   * landed — so a row means *failed* whatever it meant when it was written.
   */
  it('reads every row back as failed, because a row carries no state to read', () => {
    const rows = toOutboxRows('viewer-1', 'conv-1', [
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('local-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(fromOutboxRows(rows).map((entry) => entry.state)).toEqual(['failed', 'failed'])
  })

  it('keeps a staff Message a staff Message', () => {
    const written = staffMessage('local-1', '2026-08-13T08:00:00.000Z')

    const [restored] = fromOutboxRows(toOutboxRows('viewer-1', 'conv-1', [written]))

    expect(isStaffMessage(restored.message)).toBe(true)
    expect(restored.message).toEqual(written)
  })

  /**
   * A staged Attachment restores with the message that carries it, device URI
   * and all: what the retry has to send is the same file the person picked, and
   * an attachment dropped on the way to disk would retry into a message that has
   * quietly lost its photo. Whether the URI still resolves is a question for the
   * retry — see `missingStagedFiles` in `lib/staged-file`.
   */
  it('keeps a staged Attachment, device URI and all', () => {
    const written = customerMessage('local-1', '2026-08-13T08:00:00.000Z', {
      body: '',
      messageType: 'media',
      attachments: [
        {
          type: 'image/jpeg',
          url: 'file:///var/mobile/Containers/Data/tmp/photo.jpg',
          fileName: 'photo.jpg',
          size: 2048,
          durationSeconds: null,
          waveform: null,
        },
      ],
    })

    expect(fromOutboxRows(toOutboxRows('viewer-1', 'conv-1', [written]))).toEqual([
      { message: written, state: 'failed', restored: true },
    ])
  })

  it('keeps the reply a Message was answering', () => {
    const written = customerMessage('local-1', '2026-08-13T08:00:00.000Z', {
      replyTo: { id: 'msg-0', preview: 'Where is it?' },
    })

    expect(fromOutboxRows(toOutboxRows('viewer-1', 'conv-1', [written]))[0].message).toEqual(
      written,
    )
  })

  it('reads a thread back oldest first, whatever order the rows came out in', () => {
    const rows = toOutboxRows('viewer-1', 'conv-1', [
      customerMessage('local-3', '2026-08-13T08:02:00.000Z'),
      customerMessage('local-1', '2026-08-13T08:00:00.000Z'),
      customerMessage('local-2', '2026-08-13T08:01:00.000Z'),
    ])

    expect(fromOutboxRows(rows).map((entry) => entry.message.id)).toEqual([
      'local-1',
      'local-2',
      'local-3',
    ])
  })

  it('drops a row it cannot read rather than the thread it is in', () => {
    const rows = [
      outboxRow({ id: 'local-1' }),
      outboxRow({ id: 'local-2', payload: '{"id":' }),
      outboxRow({
        id: 'local-3',
        payload: JSON.stringify(customerMessage('local-3', '2026-08-13T08:02:00.000Z')),
      }),
    ]

    expect(fromOutboxRows(rows).map((entry) => entry.message.id)).toEqual(['local-1', 'local-3'])
  })

  it('drops a row whose payload is not a Message', () => {
    expect(fromOutboxRows([outboxRow({ payload: JSON.stringify({ id: 'local-1' }) })])).toEqual([])
  })

  it('drops a row with no payload at all', () => {
    expect(fromOutboxRows([{ id: 'local-1' } as Partial<OutboxRow>, null])).toEqual([])
  })
})
