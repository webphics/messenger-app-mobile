import { conversationTitle } from '@/lib/conversation-title'
import { canViewConversation } from '@/lib/rbac'
import type { Conversation, Label, Person, UserRole } from '@/lib/types'

export type InboxChip = 'all' | 'open' | 'resolved'

export function isResolved(conversation: Conversation, labels: Label[]): boolean {
  return conversation.labelIds.some(
    (id) => labels.find((label) => label.id === id)?.name === 'Resolved',
  )
}

export function listInboxConversations(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation[] {
  if (role === 'admin') return conversations
  if (role === 'contact') {
    return conversations.filter((c) => canViewConversation(role, userId, c))
  }
  return conversations.filter(
    (c) => c.assigneeId === userId || c.participantIds.includes(userId),
  )
}

export function listUnassignedConversations(list: Conversation[]): Conversation[] {
  return list.filter((c) => c.assigneeId === null)
}

export function latestInboxThread(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation | undefined {
  return listInboxConversations(role, userId, conversations)
    .filter((c) => c.id !== 'offers')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
}

export function filterConversations(
  list: Conversation[],
  query: string,
  chip: InboxChip,
  labels: Label[],
  people: Person[],
  selfId: string,
): Conversation[] {
  const q = query.trim().toLowerCase()
  const resolvedIds = new Set(
    labels.filter((label) => label.name === 'Resolved').map((label) => label.id),
  )
  const filtered = list.filter((conversation) => {
    const resolved = conversation.labelIds.some((id) => resolvedIds.has(id))
    if (chip === 'open' && resolved) return false
    if (chip === 'resolved' && !resolved) return false
    if (!q) return true
    const title = conversationTitle(conversation, people, selfId).toLowerCase()
    const preview = conversation.lastMessagePreview.toLowerCase()
    const subject = (conversation.subject ?? '').toLowerCase()
    return title.includes(q) || preview.includes(q) || subject.includes(q)
  })
  const pinned = filtered.filter((c) => c.id === 'offers')
  const rest = filtered.filter((c) => c.id !== 'offers')
  return [...pinned, ...rest]
}
