import { conversationTitle } from '@/lib/conversation-title'
import { findOffersConversation, sortConversations } from '@/lib/conversation-list'
import { canViewConversation } from '@/lib/rbac'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, UserRole } from '@/lib/types'

/**
 * The filters above a staff inbox.
 *
 * `mine` is the Agent's assigned list: the API sends every Support DM in their
 * organizations — assigned to anyone, unassigned, or closed — because assignment
 * is not what gates visibility, so "the ones I hold" is a view of that list
 * rather than a different request.
 */
export type InboxChip = 'all' | 'mine' | 'open' | 'resolved'

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
 * Redundant against the API, which scopes every list it sends. It survives as
 * the guard on the things counted *from* a list rather than shown as one — a
 * tab badge, a hub card — where a row the viewer should not have been sent
 * would otherwise be counted rather than merely displayed.
 */
export function listInboxConversations(
  role: UserRole,
  userId: string,
  conversations: Conversation[],
): Conversation[] {
  return conversations.filter((conversation) => canViewConversation(role, userId, conversation))
}

/**
 * The support threads assigned to one agent.
 *
 * What the Agent hub calls "Assigned to you". Assignment is not what gates
 * visibility — an Agent sees every Support DM in their organizations, which is
 * how Takeover can exist — so this counts a subset of what the list holds
 * rather than describing the list.
 */
export function listAssignedConversations(
  userId: string,
  conversations: Conversation[],
): Conversation[] {
  return conversations.filter(
    (conversation) =>
      isStaffConversation(conversation) &&
      conversation.type === 'support_dm' &&
      conversation.assignedAgent?.id === userId,
  )
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

/**
 * The thread to offer on a hub. Offers is a broadcast, not a conversation someone is having.
 *
 * No role filter: the API scoped the list it sent, and re-checking here would
 * offer a different newest thread than the inbox shows for the same payload —
 * `canViewConversation` reads a Customer's group membership out of a staff
 * payload that does not carry the viewer.
 */
export function latestInboxThread(conversations: Conversation[]): Conversation | undefined {
  const offersId = findOffersConversation(conversations)?.id
  return sortConversations(conversations).find(
    (conversation) => conversation.id !== offersId,
  )
}

export type InboxFilter = {
  query: string
  chip: InboxChip
  /** Names a Customer's own support threads, which carry no title of their own. */
  organizationNames?: ReadonlyMap<string, string>
  /** Who is looking, for the chip that asks which threads are theirs. */
  viewerId?: string
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
  { query, chip, organizationNames = new Map(), viewerId }: InboxFilter,
): Conversation[] {
  const q = query.trim().toLowerCase()
  const mine = viewerId ? new Set(listAssignedConversations(viewerId, list).map((row) => row.id)) : null
  const filtered = list.filter((conversation) => {
    const resolved = isResolved(conversation)
    if (chip === 'open' && resolved) return false
    if (chip === 'resolved' && !resolved) return false
    // Without a viewer there is nobody for a thread to belong to, so the chip
    // answers with nothing rather than with everything.
    if (chip === 'mine' && !mine?.has(conversation.id)) return false
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
