import type { Conversation, Person } from '@/lib/types'

export function conversationTitle(
  conversation: Conversation,
  people: Person[],
  selfId: string,
): string {
  if (conversation.id === 'offers') return 'Offers'
  if (conversation.kind === 'group') return conversation.subject ?? 'Group'
  const otherId = conversation.participantIds.find((id) => id !== selfId)
  const other = people.find((p) => p.id === otherId)
  return other?.displayName ?? conversation.subject ?? 'Chat'
}
