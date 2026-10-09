import { isStaffConversation } from '@/lib/types'
import type { Conversation, ConversationPerson } from '@/lib/types'

/**
 * What to call a conversation, and who to draw a presence dot for.
 *
 * A conversation does not carry a title in general — only groups and
 * announcements have one. Everything else is named after the person on the other
 * side, and who that is depends on who is looking: staff see the customer or the
 * peer the API resolved for them, and a Customer's own Support DM names nobody
 * at all. It is titled by the organization it belongs to instead, which is the
 * only thing distinguishing one Customer's support threads from another's.
 */

const SUPPORT_FALLBACK = 'Support'

/**
 * What to call the one Support DM with no organization to name it: General Support, which every
 * Customer keeps whatever organizations they join. Named for what it is, since there is nothing
 * else to name it after.
 */
export const GENERAL_SUPPORT_TITLE = 'General Support'

/** The other person in a two-sided conversation, or null where there is not one. */
export function conversationPeer(conversation: Conversation): ConversationPerson | null {
  if (!isStaffConversation(conversation)) return null
  if (conversation.type === 'support_dm') return conversation.customer
  if (conversation.type === 'staff_dm') return conversation.otherUser
  return null
}

export function conversationTitle(
  conversation: Conversation,
  organizationNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (conversation.type === 'group' || conversation.type === 'broadcast_inbox') {
    return conversation.title?.trim() || (conversation.type === 'group' ? 'Group' : 'Announcements')
  }

  if (isStaffConversation(conversation)) {
    const peer = conversationPeer(conversation)
    if (peer) return peer.name
    return conversation.title?.trim() || SUPPORT_FALLBACK
  }

  if (!conversation.organizationId) return GENERAL_SUPPORT_TITLE
  return organizationNames.get(conversation.organizationId)?.trim() || SUPPORT_FALLBACK
}

/**
 * Which desk a Staff member's Support DM row belongs to, for the chip beside its title: the
 * organization's name, or General Support. A Customer's name alone does not say which, since every
 * Customer has General Support beside their organization threads. Null for a Customer's own rows,
 * which are titled with it already, and for anything that is not a Support DM.
 */
export function conversationOrigin(
  conversation: Conversation,
): { label: string; generalSupport: boolean } | null {
  if (!isStaffConversation(conversation) || conversation.type !== 'support_dm') return null
  if (!conversation.organizationId) return { label: GENERAL_SUPPORT_TITLE, generalSupport: true }
  const name = conversation.organizationName?.trim()
  return name ? { label: name, generalSupport: false } : null
}
