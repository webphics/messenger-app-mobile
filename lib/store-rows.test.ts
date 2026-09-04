import {
  fromConversationRows,
  fromOrganizationRows,
  toConversationRows,
  toOrganizationRows,
  type ConversationRow,
  type ThreadPaging,
} from '@/lib/store-rows'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, CustomerConversation, StaffConversation } from '@/lib/types'

function customerConversation(overrides: Partial<CustomerConversation> = {}): Conversation {
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

function staffConversation(overrides: Partial<StaffConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
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
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 3,
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
