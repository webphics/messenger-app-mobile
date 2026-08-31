import { conversationTitle, otherParticipant } from '@/lib/conversation-title'
import type { Conversation, Person } from '@/lib/types'

const people: Person[] = [
  {
    id: 'agent-1',
    displayName: 'Jonah Reed',
    role: 'agent',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'customer-1',
    displayName: 'Luis Ferreira',
    role: 'customer',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 3h ago',
  },
]

const base = {
  participantIds: ['customer-1', 'agent-1'],
  assigneeId: 'agent-1',
  labelIds: [] as string[],
  lastMessagePreview: 'Hi',
  updatedAt: '2026-08-13T08:00:00.000Z',
  unreadCount: 0,
}

describe('otherParticipant', () => {
  test('returns the other person in a direct thread', () => {
    const c: Conversation = {
      ...base,
      id: 'conv-assigned',
      kind: 'direct',
      subject: 'Cannot reset password',
    }
    expect(otherParticipant(c, people, 'customer-1')?.displayName).toBe('Jonah Reed')
    expect(otherParticipant(c, people, 'agent-1')?.displayName).toBe('Luis Ferreira')
  })
})

describe('conversationTitle', () => {
  test('offers id is Offers', () => {
    const c: Conversation = { ...base, id: 'offers', kind: 'group', subject: 'Offers' }
    expect(conversationTitle(c, people, 'customer-1')).toBe('Offers')
  })

  test('direct uses the other participant name', () => {
    const c: Conversation = {
      ...base,
      id: 'conv-assigned',
      kind: 'direct',
      subject: 'Cannot reset password',
    }
    expect(conversationTitle(c, people, 'customer-1')).toBe('Jonah Reed')
    expect(conversationTitle(c, people, 'agent-1')).toBe('Luis Ferreira')
  })

  test('group uses subject or Group', () => {
    const named: Conversation = {
      ...base,
      id: 'conv-group',
      kind: 'group',
      subject: 'Warehouse onboarding',
    }
    const unnamed: Conversation = { ...named, id: 'g2', subject: null }
    expect(conversationTitle(named, people, 'customer-1')).toBe('Warehouse onboarding')
    expect(conversationTitle(unnamed, people, 'customer-1')).toBe('Group')
  })
})
