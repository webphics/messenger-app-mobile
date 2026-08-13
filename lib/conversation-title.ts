import type { Conversation, Person } from '@/lib/types'

export function otherParticipant(
  conversation: Conversation,
  people: Person[],
  selfId: string,
): Person | undefined {
  const otherId = conversation.participantIds.find((id) => id !== selfId)
  return people.find((p) => p.id === otherId)
}

export function conversationTitle(
  conversation: Conversation,
  people: Person[],
  selfId: string,
): string {
  if (conversation.id === 'offers') return 'Offers'
  if (conversation.kind === 'group') return conversation.subject ?? 'Group'
  return otherParticipant(conversation, people, selfId)?.displayName ?? conversation.subject ?? 'Chat'
}
