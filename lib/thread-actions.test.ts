import {
  canManageAssignment,
  canManageLabels,
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
