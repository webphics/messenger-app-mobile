import {
  canManageAssignment,
  canManageLabels,
  threadActions,
  transferCandidates,
} from '@/lib/thread-actions'
import type { Conversation, StaffConversation, StaffDirectoryUser } from '@/lib/types'

function thread(overrides: Partial<StaffConversation> = {}): Conversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'cust-1', name: 'Dana' },
    assignedAgent: { id: 'agent-1', name: 'Jonah' },
    otherUser: null,
    members: [],
    labels: [],
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: null,
    ...overrides,
  }
}

const ASSIGNEE = { id: 'agent-1', role: 'agent' } as const
const OTHER_AGENT = { id: 'agent-2', role: 'agent' } as const
const ADMIN = { id: 'admin-1', role: 'admin' } as const

describe('canManageAssignment', () => {
  test('the assignee of an engaged support thread may', () => {
    expect(canManageAssignment(thread(), ASSIGNEE)).toBe(true)
  })

  test('another agent may not, however engaged the thread is', () => {
    expect(canManageAssignment(thread(), OTHER_AGENT)).toBe(false)
  })

  test('an Admin who does not hold it may not either — they take it over first', () => {
    expect(canManageAssignment(thread(), ADMIN)).toBe(false)
  })

  test('an Admin who does hold it may', () => {
    const held = thread({ assignedAgent: { id: 'admin-1', name: 'Priya' } })
    expect(canManageAssignment(held, ADMIN)).toBe(true)
  })

  test('an unassigned or closed thread has no assignment to manage', () => {
    expect(canManageAssignment(thread({ status: 'unassigned', assignedAgent: null }), ASSIGNEE)).toBe(false)
    expect(canManageAssignment(thread({ status: 'closed' }), ASSIGNEE)).toBe(false)
  })

  test('only a support thread has one at all', () => {
    expect(canManageAssignment(thread({ type: 'staff_dm', status: null }), ASSIGNEE)).toBe(false)
    expect(canManageAssignment(thread({ type: 'group', status: null }), ASSIGNEE)).toBe(false)
  })

  test("a Customer's payload is never managed, whatever is on it", () => {
    const own: Conversation = {
      id: 'conv-1',
      organizationId: 'org-1',
      type: 'support_dm',
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageMine: false,
      lastMessageReceiptStatus: null,
      lastMessageRead: true,
      unreadCount: null,
    }
    expect(canManageAssignment(own, { id: 'cust-1', role: 'customer' })).toBe(false)
  })
})

describe('threadActions', () => {
  const OWN: Conversation = {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: true,
    unreadCount: null,
  }
  const CUSTOMER = { id: 'cust-1', role: 'customer' } as const

  describe('with assignment on, both follow canManageAssignment', () => {
    test.each([
      ['the assignee', thread(), ASSIGNEE, true],
      ['another agent', thread(), OTHER_AGENT, false],
      ['an Admin who does not hold it', thread(), ADMIN, false],
      ['the assignee of a closed thread', thread({ status: 'closed' }), ASSIGNEE, false],
      ['anybody on an unassigned thread', thread({ status: 'unassigned', assignedAgent: null }), ADMIN, false],
    ] as const)('%s', (_case, conversation, viewer, offered) => {
      expect(threadActions(conversation, viewer, true)).toEqual({ close: offered, transfer: offered })
    })
  })

  /*
   * A Shared queue: nobody holds a thread, so there is nothing to transfer, and
   * Close is offered to staff on any Support DM that is still open. Whether an
   * Agent has the `close` capability is the API's to answer.
   */
  describe('in a Shared queue', () => {
    test.each([
      ['an Agent, on a thread nobody engaged', thread({ status: 'unassigned', assignedAgent: null }), OTHER_AGENT],
      ['an Admin, on a thread nobody engaged', thread({ status: 'unassigned', assignedAgent: null }), ADMIN],
      ['an Agent, on a thread somebody engaged before the switch', thread(), OTHER_AGENT],
      ['whoever engaged it before the switch', thread(), ASSIGNEE],
      ['an Admin, on a thread somebody engaged before the switch', thread(), ADMIN],
    ] as const)('%s may close it and may not transfer it', (_case, conversation, viewer) => {
      expect(threadActions(conversation, viewer, false)).toEqual({ close: true, transfer: false })
    })

    test.each([
      ['a closed thread', thread({ status: 'closed' }), ADMIN],
      ['a thread with no status', thread({ status: null }), ADMIN],
      ['a staff DM', thread({ type: 'staff_dm', status: null }), ADMIN],
      ['a group', thread({ type: 'group', status: null }), ADMIN],
      ["a Customer's own thread", OWN, CUSTOMER],
    ] as const)('%s offers neither', (_case, conversation, viewer) => {
      expect(threadActions(conversation, viewer, false)).toEqual({ close: false, transfer: false })
    })
  })
})

describe('transferCandidates', () => {
  const directory: StaffDirectoryUser[] = [
    { id: 'agent-1', name: 'Jonah', role: 'agent', sharedOrganizations: null },
    { id: 'agent-2', name: 'Mira', role: 'agent', sharedOrganizations: null },
    { id: 'admin-1', name: 'Priya', role: 'admin', sharedOrganizations: null },
  ]

  test('agents only: an Admin is never a transfer target', () => {
    expect(transferCandidates(directory, thread()).map((p) => p.id)).toEqual(['agent-2'])
  })

  test('whoever holds it now is not offered it again', () => {
    const held = thread({ assignedAgent: { id: 'agent-2', name: 'Mira' } })
    expect(transferCandidates(directory, held).map((p) => p.id)).toEqual(['agent-1'])
  })
})

describe('canManageLabels', () => {
  test('an Admin defines the vocabulary; nobody else does', () => {
    expect(canManageLabels('admin')).toBe(true)
    expect(canManageLabels('agent')).toBe(false)
    expect(canManageLabels('customer')).toBe(false)
    expect(canManageLabels(null)).toBe(false)
  })
})
