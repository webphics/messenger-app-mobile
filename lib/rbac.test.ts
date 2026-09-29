import type { Capability } from '@/lib/capabilities'
import { canAccessUnassignedPool, canHoldStaffDm, canViewConversation } from '@/lib/rbac'
import type {
  BroadcastInboxConversation,
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

function viewer(role: UserRole, id: string, ...capabilities: Capability[]) {
  return { role, id, capabilities }
}

function staffDm(overrides: Partial<StaffConversation> = {}): StaffConversation {
  return staffConversation({
    type: 'staff_dm',
    status: null,
    customer: null,
    assignedAgent: null,
    otherUser: { id: 'agent-2', name: 'Priya Shah', role: 'agent' },
    ...overrides,
  })
}

const ADMIN_PEER = { id: 'admin-2', name: 'Maya Ortiz', role: 'admin' as const }

function staffGroup(memberIds: string[]): StaffConversation {
  return staffConversation({
    type: 'group',
    status: null,
    title: 'Warehouse onboarding',
    customer: null,
    assignedAgent: null,
    members: memberIds.map((id) => ({ id, name: id, role: 'agent' as const })),
  })
}

function announcements(): BroadcastInboxConversation {
  return {
    id: 'inbox-1',
    organizationId: null,
    type: 'broadcast_inbox',
    title: 'Announcements',
    ...LAST_MESSAGE,
  }
}

describe('canViewConversation', () => {
  test('a Customer may open the support thread the API handed them', () => {
    expect(canViewConversation(viewer('customer', 'customer-1'), customerSupport())).toBe(true)
  })

  test('a Customer may open a group they are a member of, and not one they are not in', () => {
    expect(
      canViewConversation(viewer('customer', 'customer-1'), customerGroup(['customer-1'])),
    ).toBe(true)
    expect(
      canViewConversation(viewer('customer', 'customer-9'), customerGroup(['customer-1'])),
    ).toBe(false)
  })

  test('a Customer holding a staff payload is holding something not meant for them', () => {
    expect(canViewConversation(viewer('customer', 'customer-1'), staffConversation())).toBe(false)
  })

  test('an Agent sees a support thread assigned to another agent — Takeover depends on it', () => {
    const other = staffConversation({ assignedAgent: { id: 'agent-2', name: 'Priya Shah' } })
    expect(canViewConversation(viewer('agent', 'agent-1'), other)).toBe(true)
  })

  test('an Agent sees a group they are a member of, and not one they are not', () => {
    expect(canViewConversation(viewer('agent', 'agent-1'), staffGroup(['agent-1']))).toBe(true)
    expect(canViewConversation(viewer('agent', 'agent-2'), staffGroup(['agent-1']))).toBe(false)
  })

  test('an Admin sees any group, as the API lets them', () => {
    expect(canViewConversation(viewer('admin', 'admin-1'), staffGroup(['agent-1']))).toBe(true)
  })

  test('staff holding a Customer payload is holding something not meant for them', () => {
    expect(canViewConversation(viewer('agent', 'agent-1'), customerSupport())).toBe(false)
  })

  test('an Announcements thread the API handed them is always openable', () => {
    expect(canViewConversation(viewer('agent', 'agent-1'), announcements())).toBe(true)
  })
})

describe('canViewConversation on a staff DM', () => {
  test.each<[string, UserRole, Capability[], Partial<StaffConversation>, boolean]>([
    ['an Agent with staff_dm and a resolved peer', 'agent', ['staff_dm'], {}, true],
    ['an Agent without staff_dm, with an Agent', 'agent', [], {}, false],
    ['an Agent without staff_dm, with an Admin', 'agent', [], { otherUser: ADMIN_PEER }, true],
    ['an Agent with staff_dm but no peer resolved', 'agent', ['staff_dm'], { otherUser: null }, false],
  ])('%s → %s', (_label, role, held, overrides, expected) => {
    const me = viewer(role, `${role}-1`, ...held)
    expect(canViewConversation(me, staffDm(overrides))).toBe(expected)
  })
})

describe('canHoldStaffDm', () => {
  test.each<[string, UserRole, Capability[], UserRole, boolean]>([
    ['an Agent with staff_dm, with an Agent', 'agent', ['staff_dm'], 'agent', true],
    ['an Agent without staff_dm, with an Agent', 'agent', [], 'agent', false],
    ['an Agent without staff_dm, with an Admin', 'agent', [], 'admin', true],
    ['an Agent with staff_dm, with a Customer', 'agent', ['staff_dm'], 'customer', false],
  ])('%s → %s', (_label, role, held, peerRole, expected) => {
    expect(canHoldStaffDm({ role, capabilities: held }, peerRole)).toBe(expected)
  })

  test('nobody signed in holds none', () => {
    expect(canHoldStaffDm(null, 'admin')).toBe(false)
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

  test('unknown role throws', () => {
    const bad = 'superuser' as UserRole
    expect(() => canAccessUnassignedPool(bad, true)).toThrow(/unknown role/i)
    expect(() =>
      canViewConversation(viewer(bad, 'x'), staffConversation() as Conversation),
    ).toThrow(/unknown role/i)
  })
})
