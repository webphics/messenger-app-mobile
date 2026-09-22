import { composerAccess } from '@/lib/composer-access'
import type {
  Conversation,
  ConversationStaffPerson,
  GroupWritePolicy,
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

function customerRow(type: 'support_dm' | 'group' | 'broadcast_inbox'): Conversation {
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
  // An Announcements thread carries no members and no policy — it is read, not
  // written in — so it is built from the base rather than from the group shape.
  if (type === 'broadcast_inbox') return { ...base, type, title: 'Announcements' }
  return {
    ...base,
    type,
    description: null,
    avatarUrl: null,
    members: [],
    title: 'QA Group',
    writePolicy: 'everyone',
    canWrite: true,
  }
}

/** A Customer's group row, locked by its write policy. */
function customerGroupRow(writePolicy: GroupWritePolicy): Conversation {
  const group = customerRow('group')
  return { ...group, writePolicy, canWrite: false } as Conversation
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

  /*
   * Read-only for everybody, which is a correction rather than a tightening.
   *
   * These cases used to assert that an Agent posted in the announcements they
   * were a member of and an Admin in any of them. The API has never allowed
   * either: it answers every reply to one with `broadcast_inbox_read_only`,
   * "Announcements cannot be replied to", and answers an Admin's management of
   * one with a 404. So the composer those cases described opened onto a refusal.
   *
   * They also described a type the API does not send. `community_announcement`
   * was this client's own invention; the wire type is `broadcast_inbox`, and
   * because the parser dropped every row it did not recognise, none of this
   * code had ever run against a real payload.
   */
  test.each([
    ['an Agent', staffRow({ type: 'broadcast_inbox', status: null, title: 'Announcements' }), ME],
    ['an Admin', staffRow({ type: 'broadcast_inbox', status: null, title: 'Announcements' }), ADMIN],
    ['a Customer', customerRow('broadcast_inbox'), CUSTOMER],
  ])('%s receives announcements rather than posting in them', (_case, conversation, viewer) => {
    expect(composerAccess(conversation, viewer)).toEqual({
      kind: 'read-only',
      reason: 'Announcements are posted by the team.',
    })
  })
})

describe("composerAccess, on a Group the viewer's own read model locks", () => {
  test('an admins-only Group says so, in its own words', () => {
    expect(composerAccess(customerGroupRow('admins'), CUSTOMER)).toEqual({
      kind: 'read-only',
      reason: "Only this group's admins can send messages here.",
    })
  })

  test('a named-writers Group the viewer is not one of says so, in its own words', () => {
    expect(composerAccess(customerGroupRow('named'), CUSTOMER)).toEqual({
      kind: 'read-only',
      reason: 'Only the members chosen for this group can send messages here.',
    })
  })

  test('an everyone-writes Group the read model still refuses stays admins-worded', () => {
    // Should not happen from a real payload -- the API resolves `canWrite` against
    // `everyone` as always true -- but a `false` reaching here picks the safer of
    // the two wordings rather than guessing.
    expect(composerAccess(customerGroupRow('everyone'), CUSTOMER)).toEqual({
      kind: 'read-only',
      reason: "Only this group's admins can send messages here.",
    })
  })

  test('a Group the viewer may write in is unchanged', () => {
    expect(composerAccess(customerRow('group'), CUSTOMER)).toEqual({ kind: 'open' })
  })

  /*
   * Staff always writes to a Group whatever its policy -- the API's `canWrite`
   * resolves `true` for an Admin or a participating Agent before the policy is
   * even consulted (#46) -- so this reads the read model exactly as the
   * Customer branch does and never derives access from `viewer.role`.
   */
  test('staff writes through a policy that locks a Customer, because the read model says so', () => {
    const locked = staffRow({ type: 'group', status: null, writePolicy: 'admins', canWrite: true })
    expect(composerAccess(locked, ME)).toEqual({ kind: 'open' })
  })
})
