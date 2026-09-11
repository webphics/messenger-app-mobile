import {
  appliedLabels,
  canLabel,
  canReadNotes,
  conversationDetailFields,
  conversationPeerRole,
  conversationTypeLabel,
  labelChipColors,
  offerableLabels,
  orderedLabels,
} from '@/lib/conversation-details'
import type { Conversation, Label } from '@/lib/types'

const LAST_MESSAGE = {
  lastMessageAt: null,
  lastMessagePreview: null,
  lastMessageMine: false,
  lastMessageReceiptStatus: null,
  lastMessageRead: true,
  unreadCount: null,
}

function staff(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    organizationId: 'org1',
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'u1', name: 'QA Customer' },
    assignedAgent: { id: 'u2', name: 'Ada' },
    otherUser: null,
    members: [],
    labels: [],
    ...LAST_MESSAGE,
    ...over,
  } as Conversation
}

function customer(): Conversation {
  return {
    id: 'c1',
    organizationId: 'org1',
    type: 'support_dm',
    ...LAST_MESSAGE,
  } as Conversation
}

function label(over: Partial<Label> = {}): Label {
  return { id: 'l1', name: 'Billing', color: 'blue', archived: false, ...over }
}

describe('conversationTypeLabel', () => {
  test('names every type the API sends', () => {
    expect(conversationTypeLabel(staff({ type: 'support_dm' }))).toBe('Support DM')
    expect(conversationTypeLabel(staff({ type: 'staff_dm' }))).toBe('Staff 1:1')
    expect(conversationTypeLabel(staff({ type: 'group' }))).toBe('Group')
    expect(conversationTypeLabel(staff({ type: 'community_announcement' }))).toBe(
      'Announcement',
    )
  })
})

describe('conversationDetailFields', () => {
  test('a Customer is told the type and nothing internal', () => {
    expect(conversationDetailFields(customer())).toEqual([
      { label: 'Type', value: 'Support DM' },
    ])
  })

  test('staff see status and the assignee on a Support DM', () => {
    expect(conversationDetailFields(staff())).toEqual([
      { label: 'Type', value: 'Support DM' },
      { label: 'Status', value: 'Assigned' },
      { label: 'Assigned agent', value: 'Ada' },
    ])
  })

  test('an unheld thread names no agent rather than an empty one', () => {
    const fields = conversationDetailFields(
      staff({ status: 'unassigned', assignedAgent: null }),
    )
    expect(fields).toContainEqual({ label: 'Assigned agent', value: 'Unassigned' })
    expect(fields).toContainEqual({ label: 'Status', value: 'Unassigned' })
  })

  test('the state is named the way the thread header names it', () => {
    // Not the API's `engaged`: the pill one tap away says Assigned, and a state
    // that renames itself between two screens reads as two states.
    expect(conversationDetailFields(staff({ status: 'engaged' }))).toContainEqual({
      label: 'Status',
      value: 'Assigned',
    })
  })

  test('closed reads as Resolved, as it does everywhere else', () => {
    expect(conversationDetailFields(staff({ status: 'closed' }))).toContainEqual({
      label: 'Status',
      value: 'Resolved',
    })
  })

  test('a group counts its members and claims no assignment', () => {
    const fields = conversationDetailFields(
      staff({
        type: 'group',
        status: null,
        members: [
          { id: 'a', name: 'Ada', role: 'agent' },
          { id: 'b', name: 'Bo', role: 'admin' },
        ],
      }),
    )
    expect(fields).toEqual([
      { label: 'Type', value: 'Group' },
      { label: 'Members', value: '2' },
    ])
  })

  test('a staff DM has a status but no assignee to name', () => {
    const fields = conversationDetailFields(staff({ type: 'staff_dm', status: null }))
    expect(fields).toEqual([{ label: 'Type', value: 'Staff 1:1' }])
  })
})

describe('appliedLabels', () => {
  test('a Customer payload carries none', () => {
    expect(appliedLabels(customer())).toEqual([])
  })

  test('the staff payload carries whatever the thread wears', () => {
    const applied = [label()]
    expect(appliedLabels(staff({ labels: applied }))).toEqual(applied)
  })
})

describe('offerableLabels', () => {
  const all = [
    label({ id: 'l1', name: 'Billing' }),
    label({ id: 'l2', name: 'Urgent' }),
    label({ id: 'l3', name: 'Old', archived: true }),
  ]

  test('offers what is not already on the thread', () => {
    const conversation = staff({ labels: [label({ id: 'l1' })] })
    expect(offerableLabels(all, conversation).map((item) => item.id)).toEqual(['l2'])
  })

  test('never offers an archived label, even on a bare thread', () => {
    expect(offerableLabels(all, staff()).map((item) => item.id)).toEqual(['l1', 'l2'])
  })

  test('offers nothing on a conversation that carries no labels at all', () => {
    expect(offerableLabels(all, customer())).toEqual([...all.slice(0, 2)])
  })
})

describe('canLabel', () => {
  test('staff on a staff payload, and nobody else', () => {
    expect(canLabel(staff(), 'agent')).toBe(true)
    expect(canLabel(staff(), 'admin')).toBe(true)
    expect(canLabel(staff(), 'customer')).toBe(false)
    expect(canLabel(customer(), 'customer')).toBe(false)
  })
})

describe('canReadNotes', () => {
  test('staff, and only on a Support DM', () => {
    expect(canReadNotes(staff(), 'agent')).toBe(true)
    expect(canReadNotes(staff({ type: 'staff_dm' }), 'agent')).toBe(false)
    expect(canReadNotes(staff({ type: 'group' }), 'admin')).toBe(false)
  })

  test('never a Customer, whose payload has no notes on it either', () => {
    expect(canReadNotes(customer(), 'customer')).toBe(false)
    expect(canReadNotes(staff(), 'customer')).toBe(false)
  })
})

describe('labelChipColors', () => {
  const COLORS = [
    'slate',
    'red',
    'orange',
    'amber',
    'green',
    'teal',
    'blue',
    'violet',
    'pink',
  ] as const

  test('every colour the API can send has a chip', () => {
    for (const color of COLORS) {
      const chip = labelChipColors(color)
      expect(chip.wash).toMatch(/^#[0-9a-f]{8}$/)
      expect(chip.ink).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('conversationPeerRole', () => {
  test('a Support DM is with the Customer', () => {
    expect(conversationPeerRole(staff())).toBe('customer')
  })

  test('a Staff DM carries the role the other side holds', () => {
    expect(
      conversationPeerRole(
        staff({
          type: 'staff_dm',
          customer: null,
          otherUser: { id: 'u3', name: 'Bo', role: 'admin' },
        }),
      ),
    ).toBe('admin')
  })

  test('a group has no single other side, and neither has a Customer payload', () => {
    expect(conversationPeerRole(staff({ type: 'group' }))).toBeNull()
    expect(conversationPeerRole(customer())).toBeNull()
  })
})

describe('orderedLabels', () => {
  function label(overrides: Partial<Label> = {}): Label {
    return { id: 'l', name: 'Billing', color: 'blue', archived: false, ...overrides }
  }

  test('live labels come first, then the retired ones', () => {
    const rows = [
      label({ id: '1', name: 'Zeta' }),
      label({ id: '2', name: 'Alpha', archived: true }),
      label({ id: '3', name: 'Beta' }),
    ]
    expect(orderedLabels(rows).map((row) => row.id)).toEqual(['3', '1', '2'])
  })

  test('the array it was handed is left alone', () => {
    const rows = [label({ id: '1', name: 'Zeta' }), label({ id: '2', name: 'Alpha' })]
    orderedLabels(rows)
    expect(rows.map((row) => row.id)).toEqual(['1', '2'])
  })
})
