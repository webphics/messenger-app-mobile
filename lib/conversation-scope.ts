import type { Conversation } from '@/lib/types'

/**
 * Which surface a conversation belongs to: the inbox, or the Communities tab.
 *
 * One question asked in one place, because it is asked from four — the inbox
 * list, the Communities list, and the unread count under each tab — and an
 * inbox that hides a thread the badge beside it is still counting is worse than
 * either mistake alone.
 *
 * The rule is `communityId` and nothing else. Type cannot answer it: a
 * Community's rooms are `group` and `broadcast_inbox`, and so are an ordinary
 * group chat and the personal Announcements thread. Those are the same shapes
 * used for different things, and only the Community that owns them tells them
 * apart — which is why `communityId` was added to the conversation payload
 * rather than being guessed at here.
 *
 * A payload with no `communityId` at all belongs to no Community. That is the
 * safe way round: an unrecognised thread stays in the inbox, where it is
 * visible, rather than disappearing into a Community that cannot be named.
 */
export function isCommunityConversation(conversation: Conversation): boolean {
  return typeof conversation.communityId === 'string' && conversation.communityId !== ''
}

/**
 * The threads the inbox owns: everything that is not a Community's.
 *
 * Support DMs, staff DMs, ordinary group chats and the person's own
 * Announcements thread. A Community's rooms are read in the Communities tab and
 * are not repeated here — which is the whole of what "it should never bleed into
 * the inbox" asks for.
 */
export function inboxConversations(list: readonly Conversation[]): Conversation[] {
  return list.filter((conversation) => !isCommunityConversation(conversation))
}

/**
 * The threads the Communities tab owns: every room belonging to a Community,
 * whichever Community that is.
 *
 * Not narrowed to the Communities this person is a *member* of. Membership
 * decides which Communities are drawn as headers — see `myCommunities` — and an
 * Admin can hold rooms in a Community they never joined. Counting those here
 * and drawing them there would be the same disagreement the inbox split exists
 * to end, so the count answers for what the API sent rather than for what the
 * header list happens to show.
 */
export function communityConversations(list: readonly Conversation[]): Conversation[] {
  return list.filter(isCommunityConversation)
}
