import { conversationPeer, conversationTitle } from '@/lib/conversation-title'
import type { Conversation, CustomerConversation, StaffConversation } from '@/lib/types'

const LAST_MESSAGE = {
  lastMessageAt: '2026-08-13T08:22:00.000Z',
  lastMessagePreview: 'Checking the mail logs now.',
  lastMessageMine: false,
  lastMessageReceiptStatus: null,
  lastMessageRead: true,
  unreadCount: 0,
} as const

function staff(overrides: Partial<StaffConversation> = {}): StaffConversation {
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

const customerSupport: CustomerConversation = {
  id: 'conv-1',
  organizationId: 'org-1',
  type: 'support_dm',
  ...LAST_MESSAGE,
}

const customerGroup: CustomerConversation = {
  id: 'group-1',
  organizationId: 'org-1',
  type: 'group',
  title: 'Offers',
  description: null,
  avatarUrl: null,
  members: [],
  writePolicy: 'everyone',
  canWrite: true,
  ...LAST_MESSAGE,
}

describe('conversationTitle', () => {
  test('a group is called what it is called', () => {
    expect(conversationTitle(customerGroup)).toBe('Offers')
  })

  test('an untitled group still has a name to render', () => {
    expect(conversationTitle(staff({ type: 'group', title: null }))).toBe('Group')
    expect(conversationTitle(staff({ type: 'community_announcement', title: '  ' }))).toBe(
      'Announcements',
    )
  })

  test('staff see a support thread by its customer', () => {
    expect(conversationTitle(staff())).toBe('Luis Ferreira')
  })

  test('staff see a staff DM by its peer', () => {
    expect(
      conversationTitle(
        staff({
          type: 'staff_dm',
          customer: null,
          otherUser: { id: 'agent-2', name: 'Priya Shah', role: 'agent' },
        }),
      ),
    ).toBe('Priya Shah')
  })

  test('a Customer sees their support thread by the organization it belongs to', () => {
    expect(conversationTitle(customerSupport, new Map([['org-1', 'Talo']]))).toBe('Talo')
  })

  test('a Customer whose organization has no name yet still sees a titled row', () => {
    expect(conversationTitle(customerSupport)).toBe('Support')
  })

  test('a support thread with no customer resolved is still named', () => {
    expect(conversationTitle(staff({ customer: null }))).toBe('Support')
  })
})

describe('conversationPeer', () => {
  test('is the customer of a staff support thread', () => {
    expect(conversationPeer(staff())?.name).toBe('Luis Ferreira')
  })

  test('is the peer of a staff DM', () => {
    expect(
      conversationPeer(
        staff({ type: 'staff_dm', otherUser: { id: 'a2', name: 'Priya Shah', role: 'agent' } }),
      )?.name,
    ).toBe('Priya Shah')
  })

  test('is nobody in a group, which has no other side', () => {
    expect(conversationPeer(staff({ type: 'group' }))).toBeNull()
  })

  test('is nobody in a Customer payload, which names no staff', () => {
    expect(conversationPeer(customerSupport as Conversation)).toBeNull()
  })
})
