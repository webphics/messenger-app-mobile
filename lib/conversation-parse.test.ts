import {
  parseConversation,
  parseConversations,
  parseMessage,
  parseMessages,
  parseOrganizations,
  parseStaffDirectory,
} from '@/lib/conversation-parse'
import { isStaffConversation, isStaffMessage } from '@/lib/types'

/** A Customer's Support DM row, exactly as `mapCustomerConversation` sends it. */
function customerSupportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    lastMessageAt: '2026-08-13T08:22:00.000Z',
    lastMessagePreview: 'Checking the mail logs now.',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 2,
    ...overrides,
  }
}

/** A staff row, as `mapStaffConversation` sends it. */
function staffRow(overrides: Record<string, unknown> = {}) {
  return {
    ...customerSupportRow(),
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Luis Ferreira', isOnline: false, lastOnlineAt: null },
    assignedAgent: { id: 'agent-1', name: 'Jonah Reed', isOnline: true, lastOnlineAt: null },
    otherUser: null,
    members: [],
    labels: [{ id: 'label-1', name: 'Urgent', color: 'red', archived: false }],
    ...overrides,
  }
}

describe('parseConversation', () => {
  test('reads a Customer support row', () => {
    const conversation = parseConversation(customerSupportRow())
    expect(conversation).toEqual({
      id: 'conv-1',
      organizationId: 'org-1',
      type: 'support_dm',
      lastMessageAt: '2026-08-13T08:22:00.000Z',
      lastMessagePreview: 'Checking the mail logs now.',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount: 2,
    })
    expect(isStaffConversation(conversation!)).toBe(false)
  })

  test('reads a staff row as the staff shape', () => {
    const conversation = parseConversation(staffRow())
    expect(isStaffConversation(conversation!)).toBe(true)
    expect(conversation).toMatchObject({
      status: 'engaged',
      customer: { id: 'cust-1', name: 'Luis Ferreira' },
      labels: [{ id: 'label-1', name: 'Urgent', color: 'red', archived: false }],
    })
  })

  test('an empty labels array still means the staff shape', () => {
    expect(isStaffConversation(parseConversation(staffRow({ labels: [] }))!)).toBe(true)
  })

  test('reads a Customer group row and keeps its members', () => {
    const conversation = parseConversation({
      ...customerSupportRow(),
      type: 'group',
      title: 'Offers',
      description: null,
      avatarUrl: null,
      members: [{ id: 'admin-1', name: 'Amina', role: 'admin' }],
    })
    expect(conversation).toMatchObject({
      type: 'group',
      title: 'Offers',
      members: [{ id: 'admin-1', name: 'Amina', role: 'admin' }],
    })
  })

  test('names an untitled group rather than rendering a blank row', () => {
    const conversation = parseConversation({
      ...customerSupportRow(),
      type: 'group',
      members: [],
    })
    expect(conversation).toMatchObject({ title: 'Group' })
  })

  test.each([
    ['no id', { id: '' }],
    ['no organization', { organizationId: undefined }],
    ['an unknown type', { type: 'smoke_signal' }],
  ])('refuses a row with %s', (_case, overrides) => {
    expect(parseConversation(customerSupportRow(overrides))).toBeNull()
  })

  test('refuses anything that is not an object', () => {
    expect(parseConversation(null)).toBeNull()
    expect(parseConversation(['a'])).toBeNull()
  })

  test('treats a row that never said whether it was read as read', () => {
    const conversation = parseConversation(
      customerSupportRow({ lastMessageRead: undefined, unreadCount: undefined }),
    )
    expect(conversation).toMatchObject({ lastMessageRead: true, unreadCount: null })
  })

  test('drops a member the payload could not name', () => {
    const conversation = parseConversation({
      ...customerSupportRow(),
      type: 'group',
      title: 'Offers',
      members: [{ id: 'admin-1', name: 'Amina', role: 'admin' }, { id: 'x' }, 'nonsense'],
    })
    expect(conversation).toMatchObject({ members: [{ id: 'admin-1' }] })
  })
})

describe('parseConversations', () => {
  test('drops the rows it cannot read and keeps the rest', () => {
    expect(
      parseConversations([customerSupportRow(), { id: 'broken' }, customerSupportRow({ id: 'conv-2' })]),
    ).toHaveLength(2)
  })

  test('reads a body that is not a list as no conversations', () => {
    expect(parseConversations({ rows: [] })).toEqual([])
  })
})

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    body: 'Hi, the reset link never arrives',
    messageType: 'text',
    createdAt: '2026-08-13T08:00:00.000Z',
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'read',
    ...overrides,
  }
}

describe('parseMessage', () => {
  test('reads a Customer message', () => {
    const message = parseMessage(messageRow({ fromCompany: true }))
    expect(message).toEqual({
      id: 'msg-1',
      body: 'Hi, the reset link never arrives',
      messageType: 'text',
      createdAt: '2026-08-13T08:00:00.000Z',
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'read',
      fromCompany: true,
    })
    expect(isStaffMessage(message!)).toBe(false)
  })

  test('reads a message with a sender as the staff shape', () => {
    const message = parseMessage(
      messageRow({ sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' } }),
    )
    expect(isStaffMessage(message!)).toBe(true)
    expect(message).toMatchObject({ sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' } })
  })

  test('keeps a system message rather than dropping it here', () => {
    expect(parseMessage(messageRow({ messageType: 'system' }))).toMatchObject({
      messageType: 'system',
    })
  })

  test('reads an unrecognised message type as text so the body still shows', () => {
    expect(parseMessage(messageRow({ messageType: 'hologram' }))).toMatchObject({
      messageType: 'text',
    })
  })

  test('reads a reply reference and its preview', () => {
    expect(
      parseMessage(messageRow({ replyTo: { id: 'msg-0', preview: 'Try the link' } })),
    ).toMatchObject({ replyTo: { id: 'msg-0', preview: 'Try the link' } })
  })

  test('reads reactions one per person, as the API sends them', () => {
    expect(
      parseMessage(
        messageRow({
          reactions: [
            { emoji: '👍', userId: 'agent-1' },
            { emoji: '👍', userId: 'cust-1' },
          ],
        }),
      ),
    ).toMatchObject({
      reactions: [
        { emoji: '👍', userId: 'agent-1' },
        { emoji: '👍', userId: 'cust-1' },
      ],
    })
  })

  test('reads every attachment on a message, not just the first', () => {
    expect(
      parseMessage(
        messageRow({
          attachments: [
            { type: 'image/png', url: '/a.png', fileName: 'a.png', size: 10 },
            { type: 'audio/m4a', url: '/b.m4a', durationSeconds: 3, waveform: [0.2] },
          ],
        }),
      )?.attachments,
    ).toEqual([
      {
        type: 'image/png',
        url: '/a.png',
        fileName: 'a.png',
        size: 10,
        durationSeconds: null,
        waveform: null,
      },
      {
        type: 'audio/m4a',
        url: '/b.m4a',
        fileName: null,
        size: null,
        durationSeconds: 3,
        waveform: [0.2],
      },
    ])
  })

  test('drops an attachment with nowhere to fetch it from', () => {
    expect(
      parseMessage(messageRow({ attachments: [{ type: 'image/png', url: '' }] }))?.attachments,
    ).toEqual([])
  })

  test.each([
    ['no id', { id: undefined }],
    ['no timestamp', { createdAt: undefined }],
    ['a timestamp that is not a time', { createdAt: 'whenever' }],
  ])('refuses a message with %s', (_case, overrides) => {
    expect(parseMessage(messageRow(overrides))).toBeNull()
  })

  test('reads a missing body as empty rather than refusing an attachment-only message', () => {
    expect(parseMessage(messageRow({ body: undefined }))).toMatchObject({ body: '' })
  })
})

describe('parseMessages', () => {
  test('keeps the API order and drops what it cannot read', () => {
    const messages = parseMessages([
      messageRow({ id: 'msg-1' }),
      { id: 'broken' },
      messageRow({ id: 'msg-2' }),
    ])
    expect(messages.map((message) => message.id)).toEqual(['msg-1', 'msg-2'])
  })
})

describe('parseOrganizations', () => {
  test('reads the rows wrapper', () => {
    expect(
      parseOrganizations({ rows: [{ id: 'org-1', name: 'Talo' }, { id: 'org-2' }] }),
    ).toEqual([{ id: 'org-1', name: 'Talo' }])
  })

  test('reads a body without rows as no organizations', () => {
    expect(parseOrganizations(null)).toEqual([])
  })
})

describe('parseStaffDirectory', () => {
  function directoryRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'agent-1',
      name: 'Jonah Reed',
      role: 'agent',
      isOnline: true,
      lastOnlineAt: null,
      sharedOrganizations: [{ id: 'org-1', name: 'Acme' }],
      ...overrides,
    }
  }

  test('reads a directory row with its shared organizations', () => {
    expect(parseStaffDirectory([directoryRow()])).toEqual([
      {
        id: 'agent-1',
        name: 'Jonah Reed',
        role: 'agent',
        isOnline: true,
        lastOnlineAt: null,
        sharedOrganizations: [{ id: 'org-1', name: 'Acme' }],
      },
    ])
  })

  test('a row without the optional field shares nothing rather than sharing unknown', () => {
    const { sharedOrganizations: _omitted, ...withoutOrganizations } = directoryRow()
    expect(parseStaffDirectory([withoutOrganizations])[0]?.sharedOrganizations).toBeNull()
  })

  test.each([
    ['no id', directoryRow({ id: '' })],
    ['no name', directoryRow({ name: '' })],
    ['a role no staff member holds', directoryRow({ role: 'customer' })],
    ['not a record', 'agent-1'],
  ])('drops a row with %s', (_case, row) => {
    expect(parseStaffDirectory([row])).toEqual([])
  })

  test('answers an empty list for a payload that is not one', () => {
    expect(parseStaffDirectory({ rows: [] })).toEqual([])
  })
})
