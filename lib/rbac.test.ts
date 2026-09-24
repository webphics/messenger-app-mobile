import {
  canAccessUnassignedPool,
  canAssignConversation,
  canBroadcast,
  canDeleteConversation,
  canDeleteMessage,
  canManageUsers,
  canSeeInternalNotes,
  canViewConversation,
} from '@/lib/rbac'
import type {
  Conversation,
  CustomerConversation,
  StaffConversation,
  UserRole,
} from '@/lib/types'

const LAST_MESSAGE = {
  lastMessageAt: '2026-08-13T08:22:00.000Z',
  lastMessagePreview: 'Checking the mail logs now.',
  lastMessageMine: false,
  lastMessageReceiptStatus: null,
  lastMessageRead: true,
  unreadCount: 0,
} as const

function staffConversation(overrides: Partial<StaffConversation> = {}): StaffConversation {
  return {
    id: 'conv-1',
    organizationId: 'org-1',
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'customer-1', name: 'Luis Ferreira' },
    assignedAgent: { id: 'agent-1', name: 'Jonah Reed' },
    otherUser: null,
    members: [],
    labels: [],
    ...LAST_MESSAGE,
    ...overrides,
  }
}

function customerSupport(): CustomerConversation {
  return { id: 'conv-1', organizationId: 'org-1', type: 'support_dm', ...LAST_MESSAGE }
}

function customerGroup(memberIds: string[]): CustomerConversation {
  return {
    id: 'group-1',
    organizationId: 'org-1',
    type: 'group',
    title: 'Offers',
    description: null,
    avatarUrl: null,
    members: memberIds.map((id) => ({ id, name: id, role: 'customer' as const })),
    writePolicy: 'everyone',
    canWrite: true,
    ...LAST_MESSAGE,
  }
}

describe('canViewConversation', () => {
  test('a Customer may open the support thread the API handed them', () => {
    expect(canViewConversation('customer', 'customer-1', customerSupport())).toBe(true)
  })

  test('a Customer may open a group they are a member of', () => {
    expect(canViewConversation('customer', 'customer-1', customerGroup(['customer-1']))).toBe(true)
  })

  test('a Customer may not open a group they are not in', () => {
    expect(canViewConversation('customer', 'customer-9', customerGroup(['customer-1']))).toBe(false)
  })

  test('a Customer holding a staff payload is holding something not meant for them', () => {
    expect(canViewConversation('customer', 'customer-1', staffConversation())).toBe(false)
  })

  test('an Agent sees a support thread assigned to another agent — Takeover depends on it', () => {
    const other = staffConversation({ assignedAgent: { id: 'agent-2', name: 'Priya Shah' } })
    expect(canViewConversation('agent', 'agent-1', other)).toBe(true)
  })

  test('an Agent sees an unassigned support thread', () => {
    const pooled = staffConversation({ status: 'unassigned', assignedAgent: null })
    expect(canViewConversation('agent', 'agent-1', pooled)).toBe(true)
  })

  test('an Agent sees a staff DM the API resolved a peer for', () => {
    const dm = staffConversation({
      type: 'staff_dm',
      status: null,
      customer: null,
      assignedAgent: null,
      otherUser: { id: 'agent-2', name: 'Priya Shah', role: 'agent' },
    })
    expect(canViewConversation('agent', 'agent-1', dm)).toBe(true)
  })

  test('an Agent does not see a staff DM with no peer resolved for them', () => {
    const dm = staffConversation({ type: 'staff_dm', status: null, otherUser: null })
    expect(canViewConversation('agent', 'agent-1', dm)).toBe(false)
  })

  test('an Agent sees a group they are a member of, and not one they are not', () => {
    const group = staffConversation({
      type: 'group',
      status: null,
      title: 'Warehouse onboarding',
      members: [{ id: 'agent-1', name: 'Jonah Reed', role: 'agent' }],
    })
    expect(canViewConversation('agent', 'agent-1', group)).toBe(true)
    expect(canViewConversation('agent', 'agent-2', group)).toBe(false)
  })

  test('an Agent holding a Customer payload is holding something not meant for them', () => {
    expect(canViewConversation('agent', 'agent-1', customerSupport())).toBe(false)
  })

  test('an Admin sees everything, in either shape', () => {
    expect(canViewConversation('admin', 'admin-1', staffConversation())).toBe(true)
    expect(canViewConversation('admin', 'admin-1', customerGroup([]))).toBe(true)
  })
})

describe('role matrix', () => {
  test('unassigned pool', () => {
    expect(canAccessUnassignedPool('customer', true)).toBe(false)
    expect(canAccessUnassignedPool('agent', true)).toBe(true)
    expect(canAccessUnassignedPool('admin', true)).toBe(true)
  })

  test('no unassigned pool in a Shared queue, for anybody', () => {
    expect(canAccessUnassignedPool('customer', false)).toBe(false)
    expect(canAccessUnassignedPool('agent', false)).toBe(false)
    expect(canAccessUnassignedPool('admin', false)).toBe(false)
  })

  test('internal notes', () => {
    expect(canSeeInternalNotes('customer')).toBe(false)
    expect(canSeeInternalNotes('agent')).toBe(true)
    expect(canSeeInternalNotes('admin')).toBe(true)
  })

  test('delete message and conversation — admin only', () => {
    expect(canDeleteMessage('customer')).toBe(false)
    expect(canDeleteMessage('agent')).toBe(false)
    expect(canDeleteMessage('admin')).toBe(true)
    expect(canDeleteConversation('customer')).toBe(false)
    expect(canDeleteConversation('agent')).toBe(false)
    expect(canDeleteConversation('admin')).toBe(true)
  })

  test('assign, broadcast, manage users — admin only', () => {
    expect(canAssignConversation('customer')).toBe(false)
    expect(canAssignConversation('agent')).toBe(false)
    expect(canAssignConversation('admin')).toBe(true)
    expect(canBroadcast('customer')).toBe(false)
    expect(canBroadcast('agent')).toBe(false)
    expect(canBroadcast('admin')).toBe(true)
    expect(canManageUsers('customer')).toBe(false)
    expect(canManageUsers('agent')).toBe(false)
    expect(canManageUsers('admin')).toBe(true)
  })

  test('unknown role throws', () => {
    const bad = 'superuser' as UserRole
    expect(() => canBroadcast(bad)).toThrow(/unknown role/i)
    expect(() => canViewConversation(bad, 'x', staffConversation() as Conversation)).toThrow(/unknown role/i)
  })
})
