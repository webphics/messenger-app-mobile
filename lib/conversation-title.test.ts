import {
  conversationOrigin,
  conversationPeer,
  conversationTitle,
} from '@/lib/conversation-title'
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

  test('a Customer sees the thread with no organization as General Support', () => {
    expect(conversationTitle({ ...customerSupport, organizationId: null })).toBe('General Support')
  })
})

describe('conversationOrigin', () => {
  test('names the organization of a Staff Support DM row', () => {
    expect(conversationOrigin(staff({ organizationName: 'Talo' }))).toEqual({
      label: 'Talo',
      generalSupport: false,
    })
  })

  test('names General Support for the row with no organization', () => {
    expect(conversationOrigin(staff({ organizationId: null }))).toEqual({
      label: 'General Support',
      generalSupport: true,
    })
  })

  test('says nothing on a Customer row, which is titled with it already', () => {
    expect(conversationOrigin(customerSupport)).toBeNull()
  })
})

describe('conversationPeer', () => {
  test('is nobody in a Customer payload, which names no staff', () => {
    expect(conversationPeer(customerSupport as Conversation)).toBeNull()
  })
})
