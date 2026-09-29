import { parseAccess } from '@/lib/conversation-access'
import {
  fromConversationRows,
  fromMessageRows,
  fromOrganizationRows,
  fromOutboxRows,
  toConversationRows,
  toMessageRows,
  toOrganizationRows,
  toOutboxRows,
  type ThreadPaging,
} from '@/lib/store-rows'
import type {
  Conversation,
  CustomerConversation,
  CustomerMessage,
  Message,
  StaffConversation,
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
})

describe('fromConversationRows', () => {
  it('gives back the conversations that were written', () => {
    const written = [customerConversation({ id: 'conv-1' }), customerConversation({ id: 'conv-2' })]

    const { conversations } = fromConversationRows(toConversationRows('viewer-1', written))

    expect(conversations).toEqual(written)
  })

  it('gives back the paging that was written', () => {
    const paging = new Map<string, ThreadPaging>([['conv-1', { hasMore: false, cursor: 'msg-40' }]])

    const restored = fromConversationRows(
      toConversationRows('viewer-1', [customerConversation()], paging),
    )

    expect(restored.paging.get('conv-1')).toEqual({ hasMore: false, cursor: 'msg-40' })
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

  /**
   * A cursor this build cannot read is a thread that pages from the top, which
   * costs a request. Dropping the conversation over it would cost a row.
   */
  it('falls back to the default paging rather than dropping a row over it', () => {
    const restored = fromConversationRows([row({ has_more: null, cursor: 42 })])

    expect(restored.conversations).toHaveLength(1)
    expect(restored.paging.get('conv-1')).toEqual({ hasMore: true, cursor: undefined })
  })

  /*
   * Story 33: a reason or a way out the API added after this build is parsed
   * into words this build has, and that parsed answer must read back from the
   * Store as it was written rather than as unknown.
   */
  it('keeps an access whose reason and way out this build did not know', () => {
    const access = parseAccess({
      write: { state: 'read_only', reason: 'must_wait', holder: null, wayOut: 'claim' },
      actions: { editMessages: false, engage: false, takeOver: false, transfer: false, close: false, reopen: false, setPriority: false, manageLabels: false, readNotes: false, writeNotes: false, setWritePolicy: false, setJoinPolicy: false, deleteMessages: false, deleteConversation: false },
    })

    const { conversations } = fromConversationRows(
      toConversationRows('viewer-1', [staffConversation({ access })]),
    )

    expect(conversations[0].access).toEqual(access)
    expect(conversations[0].access).toMatchObject({ write: { reason: 'unrecognised', wayOut: null } })
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

  // An empty name would title a thread with nothing; an absent row lets the title fall back.
  it('drops a row with an empty name', () => {
    expect(fromOrganizationRows([{ id: 'org-1', name: '' }]).size).toBe(0)
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
})

describe('fromMessageRows', () => {
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
})

describe('fromOutboxRows', () => {
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
})
