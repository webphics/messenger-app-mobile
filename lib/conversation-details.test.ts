import {
  appliedLabels,
  conversationDetailFields,
  conversationPeerRole,
  conversationTypeLabel,
  labelChipColors,
  offerableLabels,
  orderedLabels,
  peerPresence,
  supportStatusLabel,
  supportStatusTone,
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

/** Whether Support DMs are worked by assignment. See `lib/support-assignment`. */
const ASSIGNMENT = true
const SHARED_QUEUE = false

function label(over: Partial<Label> = {}): Label {
  return { id: 'l1', name: 'Billing', color: 'blue', archived: false, ...over }
}

describe('conversationTypeLabel', () => {
  test('names every type the API sends', () => {
    expect(conversationTypeLabel(staff({ type: 'support_dm' }))).toBe('Support DM')
    expect(conversationTypeLabel(staff({ type: 'staff_dm' }))).toBe('Staff 1:1')
    expect(conversationTypeLabel(staff({ type: 'group' }))).toBe('Group')
    expect(conversationTypeLabel(staff({ type: 'broadcast_inbox' }))).toBe('Announcements')
  })
})

describe('conversationDetailFields', () => {
  test('a Customer is told the type and nothing internal', () => {
    expect(conversationDetailFields(customer(), ASSIGNMENT)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
    ])
  })

  test('staff see status and the assignee on a Support DM', () => {
    expect(conversationDetailFields(staff(), ASSIGNMENT)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
      { key: 'status', label: 'Status', value: 'Assigned' },
      { key: 'assignee', label: 'Assigned agent', value: 'Ada' },
    ])
  })

  test('an unheld thread names no agent rather than an empty one', () => {
    const fields = conversationDetailFields(
      staff({ status: 'unassigned', assignedAgent: null }),
      ASSIGNMENT,
    )
    expect(fields).toContainEqual({ key: 'assignee', label: 'Assigned agent', value: 'Unassigned' })
    expect(fields).toContainEqual({ key: 'status', label: 'Status', value: 'Unassigned' })
  })

  test('the state is named the way the thread header names it', () => {
    // Not the API's `engaged`: the pill one tap away says Assigned, and a state
    // that renames itself between two screens reads as two states.
    expect(conversationDetailFields(staff({ status: 'engaged' }), ASSIGNMENT)).toContainEqual({
      key: 'status',
      label: 'Status',
      value: 'Assigned',
    })
  })

  test('closed reads as Resolved, as it does everywhere else', () => {
    expect(conversationDetailFields(staff({ status: 'closed' }), ASSIGNMENT)).toContainEqual({
      key: 'status',
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
      ASSIGNMENT,
    )
    expect(fields).toEqual([
      { key: 'type', label: 'Type', value: 'Group' },
      { key: 'members', label: 'Members', value: '2' },
    ])
  })

  test('a staff DM has a status but no assignee to name', () => {
    const fields = conversationDetailFields(staff({ type: 'staff_dm', status: null }), ASSIGNMENT)
    expect(fields).toEqual([{ key: 'type', label: 'Type', value: 'Staff 1:1' }])
  })
})

/*
 * Assignment switched off. Nobody holds a Support DM, so its state is Open or
 * Resolved and there is no assignee to name — not even one left over from
 * before the switch.
 */
describe('conversationDetailFields, in a Shared queue', () => {
  test.each([
    ['nobody engaged', staff({ status: 'unassigned', assignedAgent: null })],
    ['somebody engaged before the switch', staff({ status: 'engaged' })],
  ])('a thread %s is Open, and names no agent', (_case, conversation) => {
    expect(conversationDetailFields(conversation, SHARED_QUEUE)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
      { key: 'status', label: 'Status', value: 'Open' },
    ])
  })

  test('a closed thread is still Resolved', () => {
    expect(conversationDetailFields(staff({ status: 'closed' }), SHARED_QUEUE)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
      { key: 'status', label: 'Status', value: 'Resolved' },
    ])
  })

  test('a Customer is told the type and nothing internal, as before', () => {
    expect(conversationDetailFields(customer(), SHARED_QUEUE)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
    ])
  })
})

describe('supportStatusLabel', () => {
  test.each([
    ['unassigned', ASSIGNMENT, 'Unassigned'],
    ['engaged', ASSIGNMENT, 'Assigned'],
    ['closed', ASSIGNMENT, 'Resolved'],
    ['unassigned', SHARED_QUEUE, 'Open'],
    ['engaged', SHARED_QUEUE, 'Open'],
    ['closed', SHARED_QUEUE, 'Resolved'],
  ] as const)('%s, assignment %s, reads %s', (status, supportAssignment, expected) => {
    expect(supportStatusLabel(status, supportAssignment)).toBe(expected)
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

describe('supportStatusTone', () => {
  test('Resolved reads as done, whichever way the queue is worked', () => {
    expect(supportStatusTone('closed', ASSIGNMENT)).toBe('success')
    expect(supportStatusTone('closed', SHARED_QUEUE)).toBe('success')
  })

  test('an unheld thread asks for attention only where somebody is meant to hold it', () => {
    expect(supportStatusTone('unassigned', ASSIGNMENT)).toBe('attention')
    expect(supportStatusTone('unassigned', SHARED_QUEUE)).toBe('neutral')
  })

  test('a held thread is quiet', () => {
    expect(supportStatusTone('engaged', ASSIGNMENT)).toBe('neutral')
  })
})

describe('peerPresence', () => {
  const NOW = Date.parse('2026-09-25T12:00:00Z')

  test('somebody online is active now', () => {
    const conversation = staff({ customer: { id: 'u1', name: 'Amanda', isOnline: true } })
    expect(peerPresence(conversation, NOW)).toBe('Active now')
  })

  test('somebody offline says when they were last here', () => {
    const conversation = staff({
      customer: {
        id: 'u1',
        name: 'Amanda',
        isOnline: false,
        lastOnlineAt: '2026-09-25T11:55:00Z',
      },
    })
    expect(peerPresence(conversation, NOW)).toBe('Active 5m ago')
  })

  test('no presence on the payload claims nothing', () => {
    expect(peerPresence(staff(), NOW)).toBeNull()
    expect(peerPresence(customer(), NOW)).toBeNull()
  })

  test('a group has nobody single to report on', () => {
    expect(peerPresence(staff({ type: 'group', status: null }), NOW)).toBeNull()
  })
})
