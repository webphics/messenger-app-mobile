import { transferCandidates } from '@/lib/thread-actions'
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
