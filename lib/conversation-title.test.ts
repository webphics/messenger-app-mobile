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

describe('conversationTitle', () => {
  test('staff see a support thread by its customer', () => {
    expect(conversationTitle(staff())).toBe('Luis Ferreira')
  })

  test('a Customer sees their support thread by the organization it belongs to', () => {
    expect(conversationTitle(customerSupport, new Map([['org-1', 'Talo']]))).toBe('Talo')
  })
})

describe('conversationPeer', () => {
  test('is nobody in a Customer payload, which names no staff', () => {
    expect(conversationPeer(customerSupport as Conversation)).toBeNull()
  })
})
