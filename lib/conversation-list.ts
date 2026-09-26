import { isOutgoing, isSystemMessage } from '@/lib/thread-state'
import type { Conversation, Message } from '@/lib/types'
import { isStaffConversation } from '@/lib/types'

/**
 * What an answer means for the Conversation list — the rows, their order, and
 * what each one says about itself.
 *
 * Pure, like the thread reducers next door in `lib/thread-state`: state in,
 * state out, no network and no React. The two split where their readers do. A
 * thread is read by one screen and the Store's thread tables; the list is read
 * by the Hub, the inbox, the tab badge and the Store's `conversations` table,
 * and none of them has any use for what a page of history does to a thread.
 *
 * The dependency runs one way — the list asks two questions about a Message,
 * whether it was the viewer's own and whether it is a System notice, and both
 * are facts about a Message rather than about a thread. Nothing here is imported
 * back the other way.
 *
 * A REST page and a socket event fold in through the same functions, which is
 * why merging was written as a merge rather than as an append: a row that
 * arrived from a get-or-create and a row the list already held are the same
 * conversation, and folding by id is what makes the second arrive as a change
 * rather than as a duplicate.
 */

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

/**
 * When a conversation was last active, in epoch milliseconds, with a
 * conversation nobody has written in yet reporting 0.
 *
 * Exported because two things order by it and they must not drift apart: the
 * list on screen, and the Store's Eviction — which keeps the history of the
 * threads a person keeps coming back to, and so has to mean the same thing by
 * "recent" that the list does.
 */
export function conversationActivityAt(conversation: Conversation): number {
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
    const difference = conversationActivityAt(b) - conversationActivityAt(a)
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
  next[index] = keepUnreadCount(conversations[index], conversation)
  return sortConversations(next)
}

/**
 * The arriving row, keeping a count it did not bring.
 *
 * Only the list endpoint counts; every other path answers `null`, which means
 * "not counted" and never "nothing unread". Without this, a Customer's support
 * thread would lose its badge the moment get-or-create answered, because that
 * answer arrives beside the list rather than instead of it.
 */
function keepUnreadCount(held: Conversation, arriving: Conversation): Conversation {
  if (arriving.unreadCount !== null || held.unreadCount === null) return arriving
  return { ...arriving, unreadCount: held.unreadCount }
}

/**
 * One row, as it stands once the person has opened it.
 *
 * Both fields, because they are the two halves of the same fact and
 * `isConversationUnread` reads whichever one the row has: a counted row goes to
 * zero, and an uncounted one is read by receipt.
 */
function readRow(conversation: Conversation): Conversation {
  if (conversation.unreadCount === 0 && conversation.lastMessageRead) return conversation
  return { ...conversation, unreadCount: 0, lastMessageRead: true }
}

/**
 * The list with one conversation marked as read.
 *
 * What the badge does the instant a thread opens, ahead of the API being told.
 * Answers the list it was given when the row is absent or was already read,
 * which is what keeps opening a read thread from re-rendering every row.
 */
export function withConversationRead(
  conversations: Conversation[],
  id: string,
): Conversation[] {
  const index = conversations.findIndex((row) => row.id === id)
  if (index === -1) return conversations

  const read = readRow(conversations[index])
  if (read === conversations[index]) return conversations

  const next = [...conversations]
  next[index] = read
  return next
}

/** How much of a message a conversation row previews. The API's own length. */
const PREVIEW_LENGTH = 140

/**
 * The list, with a message that has just arrived reflected on its row.
 *
 * The API sends `conversation.updated` beside every `message.created`, and that
 * carries the row — but with `unreadCount: null`, because only the list endpoint
 * counts. So the row's preview and its place in the order would update on their
 * own and the badge would not: this is what moves the count, and it is the
 * reason unread goes up while the list is open rather than at the next fetch.
 *
 * A message in a conversation this client has never heard of leaves the list
 * exactly as it was. The `conversation.updated` beside it carries the whole row
 * and adds it; inventing one from a message would mean guessing a type and an
 * organization the payload does not carry.
 *
 * And a message no newer than the row's newest is not news about the row. The
 * API broadcasts `message.created` for every change to a message, not only for a
 * new one — a receipt advancing, and now a reaction somebody put on something
 * said yesterday. Read as an arrival, one of those drags the row's timestamp
 * back to the reacted message's, rewrites the preview with its body, and drops
 * the conversation down an order sorted on exactly that. The thread still wants
 * every one of them, which is why the rule is here rather than at the socket:
 * `applyIncomingMessage` merges them by id and the bubble changes; the list has
 * nothing to learn from one.
 *
 * Strictly newer rather than newer-or-equal, because of the order the API emits
 * in: `message.created` goes out before the `conversation.updated` beside it, so
 * a genuinely new message always arrives while the row still describes the one
 * before it. Two messages inside one millisecond would cost the second its
 * count, and the next list fetch corrects that.
 *
 * The row's receipt is left to that `conversation.updated`. A message
 * re-broadcast because its receipt advanced carries the timestamp it always had
 * and is turned away here — which changes nothing in practice, since the list
 * was already dropping it a layer up: `createCountedMessages` remembers the ids
 * it has counted and `ConversationInboxProvider` drops a repeat outright. That
 * guard exists because adding is not idempotent; this one because moving a row
 * backwards in time is not either. They overlap and neither covers the other:
 * that one lets a reaction on a message it never counted through, and this one
 * lets the second of two messages in one conversation through.
 */
export function withIncomingMessage(
  conversations: Conversation[],
  conversationId: string,
  message: Message,
  viewerId: string,
): Conversation[] {
  const index = conversations.findIndex((row) => row.id === conversationId)
  if (index === -1) return conversations

  const held = conversations[index]
  // Parsed rather than compared as text: both are the API's own ISO strings, and
  // the rest of this module already reads a timestamp as a number.
  if (Date.parse(message.createdAt) <= conversationActivityAt(held)) return conversations

  const mine = isOutgoing(message, viewerId)

  const next = [...conversations]
  next[index] = {
    ...held,
    lastMessageAt: message.createdAt,
    lastMessagePreview: message.body.slice(0, PREVIEW_LENGTH),
    lastMessageMine: mine,
    // The row's receipt is about the viewer's own last message, so someone
    // else's message leaves nothing to report.
    lastMessageReceiptStatus: mine ? message.receiptStatus : null,
    // A message the viewer wrote elsewhere is read by definition; anyone else's
    // is not, whatever the row said a moment ago.
    lastMessageRead: mine,
    unreadCount: nextUnreadCount(held.unreadCount, message, mine),
  }

  return sortConversations(next)
}

/**
 * Null stays null: it means the API declined to count, not that there is
 * nothing. `isConversationUnread` reads the receipt instead for those rows, and
 * the fields above have just told it the truth.
 *
 * A `system` notice is never counted, and that is the one rule here only Staff
 * ever exercise — the API withholds notices from a Customer's socket. An
 * Engage, a Takeover or a Transfer is the thread's record of something that
 * happened rather than something a person has to answer, and the API counts it
 * that way: `countUnreadMessagesFor` excludes those notices. Counting one
 * here would raise a staff badge that the next list fetch takes straight back
 * down, which is the one divergence a live count can afford least.
 *
 * The count is all a notice is withheld from. Every other field above still
 * follows it, because the row the API sends beside it follows it too — a notice
 * is the thread's newest message, and the preview, the order and the receipt
 * all say so.
 */
function nextUnreadCount(
  held: number | null,
  message: Message,
  mine: boolean,
): number | null {
  if (held === null) return null
  if (mine) return held
  // The onboarding welcome is a notice written for the Customer, and the API
  // counts it as unread for everyone until they read it.
  if (isSystemMessage(message) && !message.addressedToCustomer) return held
  return held + 1
}

/**
 * Why a conversation stopped being someone's.
 *
 * The API's `conversationReassignedReasons`, owned here rather than beside the
 * socket that carries them: two of them are somebody doing something — an
 * Admin's Takeover, an assignee's Transfer — and the third is a consequence, an
 * assignee whose membership of the organization was revoked losing every thread
 * they held in it. All three are facts about assignment, and the rule below is
 * the only thing that reads them.
 */
export type ReassignmentReason = 'taken_over' | 'transferred' | 'membership_revoked'

/**
 * A conversation that has just stopped being the viewer's.
 *
 * Named for what it carries rather than for the event that brings it, so the
 * rule below is stated in terms of assignment and not in terms of a socket —
 * which is why `lib/realtime-events` answers one of these rather than a payload
 * shape of its own. `assignee` is who holds the thread now, null when nobody
 * does, and named as a person rather than as a directory row because a name and
 * an id are all a conversation row shows of one.
 */
export type Reassignment = {
  conversationId: string
  reason: ReassignmentReason
  assignee: { id: string; name: string } | null
}

/**
 * The list, once a thread has been taken out of the viewer's hands.
 *
 * The event this applies is addressed rather than broadcast — the API sends
 * `conversation.reassigned` to the previous assignee's user room and to nobody
 * else — so "the viewer" and "the person who just lost it" are the same person,
 * and the two outcomes follow from why they lost it.
 *
 * A Takeover or a Transfer leaves them able to see the thread: an Agent sees
 * every Support DM in their organizations whoever holds it, which is what makes
 * the unassigned pool and Takeover possible at all. So the row stays and only
 * its assignment moves — off the Mine chip and the hub's assigned count, still
 * in the inbox.
 *
 * A revoked membership does not. They are out of the organization, so the row
 * goes: the thread returns to a pool they can no longer reach, every request
 * they could make about it would be refused, and leaving it on screen would
 * offer a thread that is not theirs to open. This is the case the event exists
 * for — the `conversation.updated` that follows every other reassignment is
 * emitted to the organization's rooms, which they have already been removed
 * from, so nothing else would ever tell them.
 *
 * Answers the list it was given when the row is not in it, and when the row is
 * a Customer's — a Customer is never sent this event, and their payload has no
 * assignment to move.
 */
export function withReassignment(
  conversations: Conversation[],
  reassignment: Reassignment,
): Conversation[] {
  if (reassignment.reason === 'membership_revoked') {
    return withoutConversation(conversations, reassignment.conversationId)
  }

  const index = conversations.findIndex((row) => row.id === reassignment.conversationId)
  if (index === -1) return conversations

  const held = conversations[index]
  if (!isStaffConversation(held)) return conversations

  const next = [...conversations]
  next[index] = {
    ...held,
    // The name is all a row shows of an assignee; presence belongs to the
    // `conversation.updated` that follows, which carries the whole row.
    assignedAgent: reassignment.assignee
      ? { id: reassignment.assignee.id, name: reassignment.assignee.name }
      : null,
    status: reassignment.assignee ? 'engaged' : 'unassigned',
  }
  return next
}

/**
 * The list without one conversation.
 *
 * A hard delete leaves nothing to refetch, so the row is dropped rather than
 * refreshed — a refresh would only find its way to a 404. Answers the list it
 * was given when the row is not in it, so an event for a conversation this
 * person never held re-renders nothing.
 */
export function withoutConversation(
  conversations: Conversation[],
  id: string,
): Conversation[] {
  return conversations.some((row) => row.id === id)
    ? conversations.filter((row) => row.id !== id)
    : conversations
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

/**
 * Unread across a list, for a tab badge.
 *
 * A floor rather than a tally. Where the API counted, the count is the answer;
 * where it declined to and the row is unread by receipt, the row is worth one,
 * because the alternative is a badge that says nothing about a conversation the
 * list beside it is showing as unread. It cannot say *how many* — nothing this
 * client holds knows that — so it says at least one.
 */
export function totalUnread(conversations: Conversation[]): number {
  return conversations.reduce((sum, conversation) => {
    if (conversation.unreadCount !== null) return sum + Math.max(0, conversation.unreadCount)
    return sum + (isConversationUnread(conversation) ? 1 : 0)
  }, 0)
}

/** Whether this row is the Offers group. See `findOffersConversation`. */
export function isOffersConversation(conversation: Conversation): boolean {
  return (
    conversation.type === 'group' &&
    conversation.title?.trim().toLowerCase() === OFFERS_TITLE.toLowerCase()
  )
}
