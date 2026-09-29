import {
  conversationDetailFields,
  offerableLabels,
  orderedLabels,
  peerPresence,
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

})

/*
 * Assignment switched off. Nobody holds a Support DM, so its state is Open or
 * Resolved and there is no assignee to name — not even one left over from
 * before the switch.
 */
describe('conversationDetailFields, in a Shared queue', () => {
  test('a thread somebody engaged before the switch is Open, and names no agent', () => {
    expect(conversationDetailFields(staff({ status: 'engaged' }), SHARED_QUEUE)).toEqual([
      { key: 'type', label: 'Type', value: 'Support DM' },
      { key: 'status', label: 'Status', value: 'Open' },
    ])
  })
})

describe('offerableLabels', () => {
  test('never offers an archived label, nor one already on the thread', () => {
    const all = [
      label({ id: 'l1', name: 'Billing' }),
      label({ id: 'l2', name: 'Urgent' }),
      label({ id: 'l3', name: 'Old', archived: true }),
    ]
    const conversation = staff({ labels: [label({ id: 'l1' })] })
    expect(offerableLabels(all, conversation).map((item) => item.id)).toEqual(['l2'])
  })
})

describe('orderedLabels', () => {
  test('live labels come first, then the retired ones', () => {
    const rows = [
      label({ id: '1', name: 'Zeta' }),
      label({ id: '2', name: 'Alpha', archived: true }),
      label({ id: '3', name: 'Beta' }),
    ]
    expect(orderedLabels(rows).map((row) => row.id)).toEqual(['3', '1', '2'])
  })
})

describe('supportStatusTone', () => {
  test('an unheld thread asks for attention only where somebody is meant to hold it', () => {
    expect(supportStatusTone('unassigned', ASSIGNMENT)).toBe('attention')
    expect(supportStatusTone('unassigned', SHARED_QUEUE)).toBe('neutral')
  })
})

describe('peerPresence', () => {
  test('a payload with no presence claims nothing', () => {
    const now = Date.parse('2026-09-25T12:00:00Z')
    expect(peerPresence(staff(), now)).toBeNull()
    expect(peerPresence(customer(), now)).toBeNull()
  })
})
