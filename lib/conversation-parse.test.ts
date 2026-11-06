import {
  parseContact,
  parseConversation,
  parseConversations,
  parseMessage,
  parseNotes,
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

/**
 * An Announcements thread, exactly as `mapBroadcastInboxConversation` sends it.
 *
 * Every field here is the API's, and the type is the one that matters: the wire
 * type is `broadcast_inbox`. This client used to declare a `community_announcement`
 * the server has never sent, and because the parser drops a row whose type it
 * does not recognise, every thread of this shape was discarded on arrival — 16
 * of one account's 36 conversations. A Broadcast notification then pointed at a
 * thread the app did not hold.
 */
function broadcastInboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-3',
    organizationId: 'org-1',
    communityId: 'community-1',
    type: 'broadcast_inbox',
    title: 'Announcements',
    lastMessageAt: '2026-08-13T08:30:00.000Z',
    lastMessagePreview: 'The office is closed on Monday.',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 1,
    ...overrides,
  }
}

describe('parseConversation, on an Announcements thread', () => {
  test('reads the row the API sends', () => {
    expect(parseConversation(broadcastInboxRow())).toEqual({
      id: 'conv-3',
      organizationId: 'org-1',
      communityId: 'community-1',
      type: 'broadcast_inbox',
      title: 'Announcements',
      lastMessageAt: '2026-08-13T08:30:00.000Z',
      lastMessagePreview: 'The office is closed on Monday.',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount: 1,
      access: { kind: 'unknown' },
    })
  })

  /**
   * The personal Announcements thread, which is the one conversation type that
   * may arrive with no organization: it belongs to a person rather than to an
   * organization, so that somebody who belongs to none still has somewhere to
   * receive a Broadcast. Requiring one was the second half of what dropped it.
   */
  test('reads one that belongs to a person rather than an organization', () => {
    const conversation = parseConversation(
      broadcastInboxRow({ organizationId: null, communityId: null }),
    )

    expect(conversation).toMatchObject({
      type: 'broadcast_inbox',
      organizationId: null,
      communityId: null,
    })
  })
})

describe('parseConversation', () => {
  test('reads a Customer support row', () => {
    const conversation = parseConversation(customerSupportRow())
    expect(conversation).toEqual({
      id: 'conv-1',
      organizationId: 'org-1',
      // A support thread belongs to no Community, which is said rather than left
      // out: the field is what the inbox and the Communities tab are split on.
      communityId: null,
      type: 'support_dm',
      lastMessageAt: '2026-08-13T08:22:00.000Z',
      lastMessagePreview: 'Checking the mail logs now.',
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: false,
      unreadCount: 2,
      // The row carries no `access`, so it reads as unknown.
      access: { kind: 'unknown' },
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

  test('refuses a row of a type this app does not know', () => {
    expect(parseConversation(customerSupportRow({ type: 'smoke_signal' }))).toBeNull()
  })

  /*
   * The second row that may arrive with no organization, alongside the personal
   * Announcements thread above: the onboarding Support DM, held by a Customer who belongs
   * nowhere yet. Refusing it would drop the only conversation such a person has.
   */
  test('reads a support row that belongs to no organization', () => {
    expect(parseConversation(customerSupportRow({ organizationId: undefined }))).toMatchObject({
      id: 'conv-1',
      type: 'support_dm',
      organizationId: null,
    })
  })

  test('reads whether a staff onboarding row is still open', () => {
    const open = parseConversation(staffRow({ organizationId: null, onboardingOpen: true }))
    expect(open).toMatchObject({ organizationId: null, onboardingOpen: true })
    const ended = parseConversation(staffRow({ organizationId: null, onboardingOpen: false }))
    expect(ended).toMatchObject({ organizationId: null, onboardingOpen: false })
  })

  /*
   * Closed unless the API says it is open: an API that predates the field, or a value this
   * build cannot read, must not offer to place a Customer who may already belong somewhere.
   */
  test('reads a staff row with no or an unreadable onboardingOpen as closed', () => {
    expect(parseConversation(staffRow({ organizationId: null }))).toMatchObject({
      onboardingOpen: false,
    })
    expect(
      parseConversation(staffRow({ organizationId: null, onboardingOpen: 'true' })),
    ).toMatchObject({ onboardingOpen: false })
  })

  test("adds no onboardingOpen to a Customer's own onboarding row", () => {
    const own = parseConversation(
      customerSupportRow({ organizationId: null, onboardingOpen: true }),
    )
    expect(own).not.toHaveProperty('onboardingOpen')
  })

  test('still refuses a group that belongs to no organization', () => {
    expect(
      parseConversation(customerSupportRow({ type: 'group', organizationId: undefined })),
    ).toBeNull()
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
      editedAt: null,
      editableUntil: null,
      replyTo: null,
      reactions: [],
      attachments: [],
      receiptStatus: 'read',
      fromCompany: true,
    })
    expect(isStaffMessage(message!)).toBe(false)
  })

  /**
   * A sender writes an attachment's URL. One naming a file on this phone would
   * be handed to the share sheet when tapped, so a network payload never
   * carries one through; only the Outbox (`fromDevice`) keeps a device URI.
   */
  test('drops an attachment whose URL names a file on this device', () => {
    const attachments = [
      { type: 'application/pdf', url: '/uploads/chat/a.pdf', fileName: 'a.pdf', size: 10 },
      {
        type: 'application/pdf',
        url: 'file:///data/user/0/com.thechatroute.app/files/SQLite/chatroute-store.db',
        fileName: 'invoice.pdf',
        size: 10,
      },
      { type: 'image/jpeg', url: 'content://media/external/images/media/42', fileName: null },
      { type: 'image/jpeg', url: 'https://files.example/a.jpg', fileName: null },
    ]
    const row = messageRow({ fromCompany: true, attachments })

    expect(parseMessage(row)?.attachments.map((attachment) => attachment.url)).toEqual([
      '/uploads/chat/a.pdf',
      'https://files.example/a.jpg',
    ])
    expect(parseMessage(row, { fromDevice: true })?.attachments).toHaveLength(4)
  })

  test.each([
    ['missing, an API from before the field', undefined],
    ['not a date', 'in a while'],
  ])('reads an edit window that is %s as no Edit', (_case, editableUntil) => {
    expect(parseMessage(messageRow({ fromCompany: false, editableUntil }))?.editableUntil).toBeNull()
  })

  test.each([
    ['true', true, true],
    ['false', false, undefined],
    ['missing, an API from before the field or a Customer payload', undefined, undefined],
    ['not a boolean', 'yes', undefined],
  ])('reads deletable that is %s', (_case, deletable, parsed) => {
    const message = parseMessage(messageRow({ fromCompany: false, deletable }))
    expect(message?.deletable).toBe(parsed)
    // Read back through the same parser, the way the Store does.
    expect(parseMessage(message)?.deletable).toBe(parsed)
  })

  test('reads a message with a sender as the staff shape', () => {
    const message = parseMessage(
      messageRow({ sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' } }),
    )
    expect(isStaffMessage(message!)).toBe(true)
    expect(message).toMatchObject({ sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' } })
  })

  test('reads an unrecognised message type as text so the body still shows', () => {
    expect(parseMessage(messageRow({ messageType: 'hologram' }))).toMatchObject({
      messageType: 'text',
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
    ['a timestamp that is not a time', { createdAt: 'whenever' }],
  ])('refuses a message with %s', (_case, overrides) => {
    expect(parseMessage(messageRow(overrides))).toBeNull()
  })

  test('reads a missing body as empty rather than refusing an attachment-only message', () => {
    expect(parseMessage(messageRow({ body: undefined }))).toMatchObject({ body: '' })
  })
})

describe('parseOrganizations', () => {
  test('reads the rows wrapper', () => {
    expect(
      parseOrganizations({ rows: [{ id: 'org-1', name: 'Talo' }, { id: 'org-2' }] }),
    ).toEqual([{ id: 'org-1', name: 'Talo' }])
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
    ['a role no staff member holds', directoryRow({ role: 'customer' })],
    ['not a record', 'agent-1'],
  ])('drops a row with %s', (_case, row) => {
    expect(parseStaffDirectory([row])).toEqual([])
  })
})

/*
 * `access` arrives on every conversation shape, and `parseConversation` reads
 * it through the Conversation access adapter. What each answer shows is the
 * adapter's own tests; these check only that no shape drops the field.
 */
describe('parseConversation, reading access', () => {
  const READ_ONLY = {
    write: {
      state: 'read_only',
      reason: 'already_engaged',
      holder: { id: 'agent-2', name: 'Priya Raman' },
      wayOut: null,
    },
    actions: { editMessages: false, engage: false, takeOver: false, transfer: false, close: false, reopen: false, setPriority: true, manageLabels: true, readNotes: true, writeNotes: true, setWritePolicy: false, setJoinPolicy: false, deleteMessages: false, deleteConversation: false },
  }
  const OPEN = { write: { state: 'open' }, actions: { editMessages: true, engage: false, takeOver: false, transfer: false, close: false, reopen: false, setPriority: false, manageLabels: false, readNotes: false, writeNotes: false, setWritePolicy: false, setJoinPolicy: false, deleteMessages: false, deleteConversation: false } }
  const NO_ACTIONS = { editMessages: false, engage: false, takeOver: false, transfer: false, close: false, reopen: false, setPriority: false, manageLabels: false, readNotes: false, writeNotes: false, setWritePolicy: false, setJoinPolicy: false, deleteMessages: false, deleteConversation: false }

  const customerGroupRow = (overrides: Record<string, unknown> = {}) => ({
    ...customerSupportRow(),
    type: 'group',
    title: 'Offers',
    description: null,
    avatarUrl: null,
    members: [],
    writePolicy: 'admins',
    canWrite: false,
    ...overrides,
  })

  test.each([
    ['a staff row', staffRow({ access: READ_ONLY }), READ_ONLY],
    ["a Customer's Support DM", customerSupportRow({ access: OPEN }), OPEN],
    [
      'an Announcements thread',
      broadcastInboxRow({
        access: { write: { state: 'read_only', reason: 'broadcast_inbox_read_only' }, actions: NO_ACTIONS },
      }),
      {
        write: { state: 'read_only', reason: 'broadcast_inbox_read_only', holder: null, wayOut: null },
        actions: NO_ACTIONS,
      },
    ],
  ])('keeps the access on %s', (_case, payload, access) => {
    expect(parseConversation(payload)?.access).toEqual(access)
  })

  test('reads a malformed access as unknown and keeps the row', () => {
    const conversation = parseConversation(
      staffRow({ access: { write: { state: 'read_only', reason: 42 }, actions: NO_ACTIONS } }),
    )

    expect(conversation).toMatchObject({ id: 'conv-1', access: { kind: 'unknown' } })
  })

  /*
   * `canWrite` stays in the payload, deprecated, and no longer decides the
   * composer. A Group the API opened to this viewer is open whatever it says.
   */
  test("does not let a Group's deprecated canWrite override its access", () => {
    const conversation = parseConversation(customerGroupRow({ canWrite: false, access: OPEN }))

    expect(conversation?.access).toEqual(OPEN)
  })
})

describe('parseNotes', () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    id: 'note-1',
    text: 'This is a scammer',
    author: { id: 'agent-1', name: 'Rizwan Manzoor' },
    messageId: null,
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    access: { edit: true, delete: true },
    createdAt: '2026-09-25T07:41:00.000Z',
    ...overrides,
  })

  it('reads a live, edited note with its access and the message it is about', () => {
    expect(
      parseNotes([note({ editedAt: '2026-09-26T11:02:10.000Z', messageId: 'msg-9' })]),
    ).toEqual([
      {
        id: 'note-1',
        text: 'This is a scammer',
        author: { id: 'agent-1', name: 'Rizwan Manzoor' },
        messageId: 'msg-9',
        createdAt: '2026-09-25T07:41:00.000Z',
        editedAt: '2026-09-26T11:02:10.000Z',
        deletedAt: null,
        deletedBy: null,
        access: { edit: true, delete: true },
      },
    ])
  })

  it('keeps a deleted note as a tombstone naming who deleted it', () => {
    const tombstone = note({
      id: 'note-2',
      deletedAt: '2026-09-26T11:05:43.000Z',
      deletedBy: { id: 'admin-1', name: 'Tajbin Khan' },
      access: { edit: false, delete: false },
    })

    expect(parseNotes([note(), tombstone])[1]).toMatchObject({
      id: 'note-2',
      deletedAt: '2026-09-26T11:05:43.000Z',
      deletedBy: { id: 'admin-1', name: 'Tajbin Khan' },
      access: { edit: false, delete: false },
    })
  })

  it.each([
    ['no access block', { access: undefined }],
    ['a null access block', { access: null }],
    ['truthy non-booleans', { access: { edit: 'yes', delete: 1 } }],
  ])('offers no actions for %s', (_label, overrides) => {
    expect(parseNotes([note(overrides)])[0]?.access).toEqual({ edit: false, delete: false })
  })

  it('reads a note from an API that sends none of the newer fields', () => {
    const { editedAt, deletedAt, deletedBy, access, ...older } = note()
    void editedAt
    void deletedAt
    void deletedBy
    void access
    expect(parseNotes([older])[0]).toMatchObject({
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      access: { edit: false, delete: false },
    })
  })

  it('drops a live note with no text, and keeps a tombstone without one', () => {
    const parsed = parseNotes([
      note({ id: 'live', text: '' }),
      note({ id: 'gone', text: undefined, deletedAt: '2026-09-26T11:05:43.000Z' }),
    ])
    expect(parsed.map((n) => [n.id, n.text])).toEqual([['gone', '']])
  })
})

describe('parseContact', () => {
  const row = {
    id: 'cust-1',
    name: 'Mara Lin',
    kind: 'customer',
    role: 'customer',
    conversationId: 'conv-1',
  }

  test('reads the organizations a conversation with the contact can belong to', () => {
    const parsed = parseContact({
      ...row,
      organizations: [
        { id: 'org-1', name: 'Talo' },
        { id: 'org-2', name: 'Northwind' },
        { id: 'org-3' },
      ],
    })
    expect(parsed?.organizations).toEqual([
      { id: 'org-1', name: 'Talo' },
      { id: 'org-2', name: 'Northwind' },
    ])
  })

  test('an empty list and an absent field stay different', () => {
    expect(parseContact({ ...row, organizations: [] })?.organizations).toEqual([])
    expect(parseContact(row)?.organizations).toBeNull()
  })
})
