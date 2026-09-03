import { conversationTitle } from '@/lib/conversation-title'
import { findOffersConversation, sortConversations } from '@/lib/conversation-state'
import { canViewConversation } from '@/lib/rbac'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, UserRole } from '@/lib/types'

export type InboxChip = 'all' | 'open' | 'resolved'

/**
 * Whether a conversation is done with.
 *
 * The mock read this off a "Resolved" label an Agent attached by hand. The API
 * has a field for it — a Support DM is `closed` or it is not — and labels are
 * free-form colour tags that mean whatever an organization decides. A Customer's
 * payload carries no status at all, which is why the Customer inbox does not
 * offer this filter.
 */
export function isResolved(conversation: Conversation): boolean {
  return isStaffConversation(conversation) && conversation.status === 'closed'
}

/**
 * The conversations a role may see, out of a list this client already holds.
 *
 * Redundant against the API, which scopes every list it sends — kept for the
 * Agent and Admin screens, which still read a local list until #32 wires them to
 * the API.
 */
export function listInboxConversations(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation[] {
  return conversations.filter((conversation) => canViewConversation(role, userId, conversation))
}

/** The pickup queue: support threads nobody has engaged. */
export function listUnassignedConversations(list: Conversation[]): Conversation[] {
  return list.filter(
    (conversation) =>
      isStaffConversation(conversation) &&
      conversation.type === 'support_dm' &&
      conversation.status === 'unassigned',
  )
}

/** The thread to offer on a hub. Offers is a broadcast, not a conversation someone is having. */
export function latestInboxThread(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation | undefined {
  const offersId = findOffersConversation(conversations)?.id
  return sortConversations(listInboxConversations(role, userId, conversations)).find(
    (conversation) => conversation.id !== offersId,
  )
}

/**
 * The inbox list as the search field and the chips leave it, with Offers pinned.
 *
 * Pinned by identity rather than by sort order: Offers carries the company's
 * announcements and belongs at the top whether or not it is the most recent
 * thing that happened.
 */
export function filterConversations(
  list: Conversation[],
  query: string,
  chip: InboxChip,
  organizationNames: ReadonlyMap<string, string> = new Map(),
): Conversation[] {
  const q = query.trim().toLowerCase()
  const filtered = list.filter((conversation) => {
    const resolved = isResolved(conversation)
    if (chip === 'open' && resolved) return false
    if (chip === 'resolved' && !resolved) return false
    if (!q) return true

    const title = conversationTitle(conversation, organizationNames).toLowerCase()
    const preview = (conversation.lastMessagePreview ?? '').toLowerCase()
    return title.includes(q) || preview.includes(q)
  })

  const offersId = findOffersConversation(filtered)?.id
  if (!offersId) return filtered

  return [
    ...filtered.filter((conversation) => conversation.id === offersId),
    ...filtered.filter((conversation) => conversation.id !== offersId),
  ]
}
