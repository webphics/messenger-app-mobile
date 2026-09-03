import type { Conversation, ConversationType, Message, UserRole } from '@/lib/types'
import { isStaffMessage } from '@/lib/types'

/**
 * What a REST answer means for what is on screen.
 *
 * Everything here is pure: state in, state out, no network and no React. It is
 * where the rules that would otherwise be scattered through screens live — which
 * messages a viewer may see, how a page of history joins the pages already held,
 * how far back the next page should ask for, and whether a row is unread.
 *
 * The same functions are what the socket layer will fold events into (#31),
 * which is the reason merging is written as a merge rather than as an append.
 */

export type ThreadState = {
  /** Oldest first, deduplicated by id. */
  messages: Message[]
  /** Whether asking for another page is still worth a request. */
  hasMore: boolean
  /**
   * The id the next page reads backwards from: the oldest message the API has
   * handed over, including one it handed over and this viewer may not see.
   */
  cursor: string | undefined
}

export function emptyThread(): ThreadState {
  return { messages: [], hasMore: true, cursor: undefined }
}

/**
 * Whether a message may be shown to the person looking at it.
 *
 * The rule: a Customer never sees a `system` message in a Support DM. The only
 * system messages the product writes are the Engage, Takeover and Transfer
 * notices, and each reports an assignment event and names the staff member who
 * caused it. Assignment is internal, and the company is meant to reach a
 * Customer as one voice rather than as whoever is currently holding the thread.
 *
 * The API enforces this and withholds those messages from a Customer's payload
 * before it is sent — the same predicate, under the same name, lives in its
 * `conversations.mapper.ts`. This copy is the second lock on a door that is
 * already locked: a client filter is not a security boundary, but the client
 * should not be assuming every message it receives is a normal chat bubble
 * either. The web client keeps the same copy for the same reason.
 */
export function isMessageVisibleTo(
  role: UserRole,
  conversationType: ConversationType,
  message: Pick<Message, 'messageType'>,
): boolean {
  if (role !== 'customer' || conversationType !== 'support_dm') return true
  return message.messageType !== 'system'
}

export function visibleMessages(
  role: UserRole,
  conversationType: ConversationType,
  messages: Message[],
): Message[] {
  return messages.filter((message) => isMessageVisibleTo(role, conversationType, message))
}

function byCreatedAt(a: Message, b: Message): number {
  const difference = Date.parse(a.createdAt) - Date.parse(b.createdAt)
  // Two messages can share a timestamp on a busy thread; the id keeps the order
  // of a rendered list from changing under someone between two renders.
  return difference !== 0 ? difference : a.id.localeCompare(b.id)
}

/**
 * Folds messages into a thread, keyed by id so one that arrives twice replaces
 * rather than duplicates — which is what a page fetched again after a reconnect,
 * or a message re-broadcast once its receipts are applied, actually is.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing

  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) {
    byId.set(message.id, message)
  }

  return [...byId.values()].sort(byCreatedAt)
}

/**
 * One page of history, applied to what is already on screen.
 *
 * Two things here are deliberate and neither is obvious.
 *
 * The cursor advances from the *raw* page, not from the messages that survived
 * the visibility filter. Advancing it from the visible ones would stall on a
 * page that happened to hold nothing but system notices: the next request would
 * ask from the same place and get the same page, forever.
 *
 * And only an empty page ends the thread. A short page does not, because the API
 * takes its page first and filters it afterwards — forty-eight messages back
 * from a fifty-message request can mean two system notices were withheld, not
 * that history has run out. The cost of being wrong the other way is one extra
 * request that answers with nothing; the cost of guessing from the length is a
 * thread that silently refuses to scroll further back.
 */
export function applyMessagePage(
  state: ThreadState,
  page: Message[],
  viewer: { role: UserRole; conversationType: ConversationType },
): ThreadState {
  return {
    messages: mergeMessages(
      state.messages,
      visibleMessages(viewer.role, viewer.conversationType, page),
    ),
    hasMore: page.length > 0,
    cursor: page[0]?.id ?? state.cursor,
  }
}

/** Whether a message was sent by the person reading it. */
export function isOutgoing(message: Message, viewerId: string): boolean {
  return isStaffMessage(message) ? message.sender.id === viewerId : !message.fromCompany
}

/**
 * Who to name above an incoming bubble, when the thread names anyone.
 *
 * A Customer's Support DM messages carry no sender by design — the company
 * speaks as one voice — so there is nothing to name and this answers undefined.
 */
export function messageSenderName(message: Message): string | undefined {
  return isStaffMessage(message) ? message.sender.name : undefined
}

/**
 * Whether a row should read as unread.
 *
 * `unreadCount` is the answer wherever the API gives one, but it gives one only
 * on the list endpoint — every other path reports null rather than pay for the
 * count. So a row fetched on its own falls back to the receipt the list row
 * carries anyway: the last message is unread if it was not the viewer's own and
 * they have no read receipt on it.
 */
export function isConversationUnread(conversation: Conversation): boolean {
  if (conversation.unreadCount !== null) return conversation.unreadCount > 0
  return !conversation.lastMessageMine && !conversation.lastMessageRead
}

function activityAt(conversation: Conversation): number {
  return conversation.lastMessageAt ? Date.parse(conversation.lastMessageAt) : 0
}

/**
 * Newest activity first, with a conversation nobody has written in yet last.
 *
 * The API already sorts its list; this exists because a conversation that
 * arrived from somewhere else — a get-or-create answered separately, a socket
 * event later — has to land in the right place without refetching the list.
 */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const difference = activityAt(b) - activityAt(a)
    return difference !== 0 ? difference : a.id.localeCompare(b.id)
  })
}

/**
 * Folds one conversation into a list, replacing the row with the same id.
 *
 * The get-or-create call and the list call race: whichever answers second is the
 * one holding a row the other does not have, and neither is wrong.
 */
export function mergeConversation(
  conversations: Conversation[],
  conversation: Conversation,
): Conversation[] {
  const index = conversations.findIndex((row) => row.id === conversation.id)
  if (index === -1) return sortConversations([...conversations, conversation])

  const next = [...conversations]
  next[index] = conversation
  return sortConversations(next)
}

/**
 * The Offers group.
 *
 * Offers is a shared group conversation an Admin creates server-side, not a
 * fixed id this client can hold: the mock knew it as `id: "offers"` and nothing
 * on the API answers to that. What identifies it is its title, so this is the
 * one place that says so, and every screen that wants Offers asks here rather
 * than hard-coding a title comparison of its own.
 */
export const OFFERS_TITLE = 'Offers'

export function findOffersConversation(
  conversations: Conversation[],
): Conversation | undefined {
  return conversations.find(isOffersConversation)
}

/** Unread across a list, for a tab badge. */
export function totalUnread(conversations: Conversation[]): number {
  return conversations.reduce(
    (sum, conversation) => sum + Math.max(0, conversation.unreadCount ?? 0),
    0,
  )
}

/** Whether this row is the Offers group. See `findOffersConversation`. */
export function isOffersConversation(conversation: Conversation): boolean {
  return (
    conversation.type === 'group' &&
    conversation.title?.trim().toLowerCase() === OFFERS_TITLE.toLowerCase()
  )
}
