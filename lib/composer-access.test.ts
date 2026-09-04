import { composerAccess } from '@/lib/composer-access'
import type {
  Conversation,
  ConversationStaffPerson,
  StaffConversation,
  SupportStatus,
} from '@/lib/types'

const ME = { id: 'me', role: 'agent' } as const
const ADMIN = { id: 'me', role: 'admin' } as const
const CUSTOMER = { id: 'me', role: 'customer' } as const

const OTHER_AGENT = { id: 'agent-2', name: 'Priya Raman', role: 'agent' as const }

function staffRow(overrides: Partial<StaffConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Luis Ferreira' },
    assignedAgent: OTHER_AGENT,
    otherUser: null,
    members: [],
    labels: [],
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
    ...overrides,
  } as StaffConversation
}

function customerRow(type: 'support_dm' | 'group' | 'community_announcement'): Conversation {
  const base = {
    id: 'conv-2',
    organizationId: 'org-1',
    lastMessageAt: '2026-08-13T08:00:00.000Z',
    lastMessagePreview: 'Hello',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: 0,
  }
  if (type === 'support_dm') return { ...base, type }
  // Two returns rather than one with a computed `type`: a union of both literals
  // is not assignable to either member of the discriminated union.
  const shared = { ...base, description: null, avatarUrl: null, members: [] }
  return type === 'group'
    ? { ...shared, type, title: 'QA Group' }
    : { ...shared, type, title: 'Announcements' }
}

describe('composerAccess, on a Support DM', () => {
  test('the agent holding the thread writes in it', () => {
    const mine = staffRow({ assignedAgent: { id: 'me', name: 'Jonah Reed' } })
    expect(composerAccess(mine, ME)).toEqual({ kind: 'open' })
  })

  test('another agent may read it and is told who has it', () => {
    expect(composerAccess(staffRow(), ME)).toEqual({
      kind: 'read-only',
      reason: 'Priya Raman is handling this conversation.',
    })
  })

  test('an engaged thread with nobody named still says why it is read-only', () => {
    expect(composerAccess(staffRow({ assignedAgent: null }), ME)).toEqual({
      kind: 'read-only',
      reason: 'Another agent is handling this conversation.',
    })
  })

  test('an Admin is offered the Takeover the API would accept from them', () => {
    expect(composerAccess(staffRow(), ADMIN)).toEqual({
      kind: 'read-only',
      reason: 'Take over this conversation to reply.',
      action: { kind: 'takeover', label: 'Take over' },
    })
  })

  test('an Agent is offered no Takeover, because the API answers theirs 403', () => {
    expect(composerAccess(staffRow(), ME)).not.toHaveProperty('action')
  })

  test.each([ME, ADMIN])('either staff role may engage an unassigned thread', (viewer) => {
    expect(composerAccess(staffRow({ status: 'unassigned', assignedAgent: null }), viewer)).toEqual(
      {
        kind: 'read-only',
        reason: 'Engage this conversation to reply.',
        action: { kind: 'engage', label: 'Engage chat' },
      },
    )
  })

  test.each([ME, ADMIN])('a closed thread offers neither role a way in', (viewer) => {
    expect(composerAccess(staffRow({ status: 'closed', assignedAgent: null }), viewer)).toEqual({
      kind: 'read-only',
      reason: 'This conversation is closed.',
    })
  })

  test('a status the client does not recognise leaves the composer open', () => {
    expect(composerAccess(staffRow({ status: null }), ME)).toEqual({ kind: 'open' })
  })

  test("a Customer writes in their own thread whatever its state, which their payload does not carry", () => {
    expect(composerAccess(customerRow('support_dm'), CUSTOMER)).toEqual({ kind: 'open' })
  })
})

describe('composerAccess, on the other conversation types', () => {
  test.each([
    ['a staff DM', staffRow({ type: 'staff_dm', status: null, otherUser: OTHER_AGENT })],
    ['a staff group', staffRow({ type: 'group', status: null, title: 'QA Group' })],
    ["a Customer's group", customerRow('group')],
  ])('%s is writable by whoever the API sent it to', (_case, conversation) => {
    expect(composerAccess(conversation, ME)).toEqual({ kind: 'open' })
  })

  test('an Agent posts in the announcements they were added to', () => {
    const member: ConversationStaffPerson = { id: 'me', name: 'Jonah Reed', role: 'agent' }
    const announcement = staffRow({
      type: 'community_announcement',
      status: null,
      title: 'Announcements',
      members: [member],
    })
    expect(composerAccess(announcement, ME)).toEqual({ kind: 'open' })
  })

  test('and reads the ones they were not', () => {
    const announcement = staffRow({
      type: 'community_announcement',
      status: null,
      title: 'Announcements',
      members: [OTHER_AGENT],
    })
    expect(composerAccess(announcement, ME)).toEqual({
      kind: 'read-only',
      reason: 'Announcements are posted by the team.',
    })
  })

  test('an Admin posts in any announcement', () => {
    const announcement = staffRow({
      type: 'community_announcement',
      status: null,
      title: 'Announcements',
      members: [],
    })
    expect(composerAccess(announcement, ADMIN)).toEqual({ kind: 'open' })
  })

  test('a Customer receives announcements rather than posting in them', () => {
    expect(composerAccess(customerRow('community_announcement'), CUSTOMER)).toEqual({
      kind: 'read-only',
      reason: 'Announcements are posted by the team.',
    })
  })
})
