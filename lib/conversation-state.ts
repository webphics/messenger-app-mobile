import type {
  Conversation,
  ConversationType,
  Message,
  MessageAttachment,
  UserRole,
} from '@/lib/types'
import { isStaffMessage } from '@/lib/types'

/**
 * What a REST answer means for what is on screen.
 *
 * Everything here is pure: state in, state out, no network and no React. It is
 * where the rules that would otherwise be scattered through screens live — which
 * messages a viewer may see, how a page of history joins the pages already held,
 * how far back the next page should ask for, whether a row is unread, and what
 * becomes of a message someone typed while the request carrying it is out.
 *
 * The same functions are what the socket layer will fold events into (#31),
 * which is the reason merging is written as a merge rather than as an append.
 */

/**
 * How far a message typed on this device has got — which is not a receipt.
 *
 * `receiptStatus` is the server's word about a message it already holds; this is
 * this device's word about one it may not hold yet. The two never overlap: an
 * unsent message has no receipt until the API answers with one, and by then it
 * is no longer unsent.
 *
 * Deliberately not called *outgoing*: `isOutgoing` already means "sent by the
 * person reading it", which is what a bubble's `outgoing` prop is, and a message
 * can be outgoing in that sense for the rest of its life.
 */
export type DeliveryState = 'sending' | 'failed'

/** A message typed here, from the tap on send until the API confirms it. */
export type UnsentMessage = {
  /** Carries a local id. The one the API assigns replaces it rather than joining it. */
  message: Message
  state: DeliveryState
}

/** What the composer hands whatever is going to send it. */
export type SendDraft = {
  body: string
  /** The message being answered, or null when this is not a reply. */
  replyTo: Message | null
}

export type ThreadState = {
  /** Oldest first, deduplicated by id. What the API has confirmed. */
  messages: Message[]
  /**
   * Sent from here and not yet confirmed, kept apart from the confirmed pages so
   * that a page arriving mid-send — a refresh, a scroll into history — cannot
   * overwrite one, and so that nothing has to guess whether an id is the
   * server's.
   */
  unsent: UnsentMessage[]
  /** Whether asking for another page is still worth a request. */
  hasMore: boolean
  /**
   * The id the next page reads backwards from: the oldest message the API has
   * handed over, including one it handed over and this viewer may not see.
   */
  cursor: string | undefined
}

export function emptyThread(): ThreadState {
  return { messages: [], unsent: [], hasMore: true, cursor: undefined }
}

/**
 * The pages dropped and the unsent messages kept: what a refresh rebuilds from.
 *
 * A refresh re-reads the newest page and starts the thread over from it, which
 * must not take a message still in flight down with it — the person typed it,
 * can see it, and the request carrying it is still out.
 */
export function withoutPages(state: ThreadState): ThreadState {
  return { ...emptyThread(), unsent: state.unsent }
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
    ...state,
    messages: mergeMessages(
      state.messages,
      visibleMessages(viewer.role, viewer.conversationType, page),
    ),
    hasMore: page.length > 0,
    cursor: page[0]?.id ?? state.cursor,
  }
}

/**
 * The prefix every id minted on this device carries.
 *
 * The API's ids are UUIDs, so a prefixed one cannot collide with a real message,
 * and anything holding an id can tell whether the server has ever seen it. Two
 * places need to: a bubble, which animates an echo in and not a fetched message,
 * and a reply, which must not send the API a `replyToMessageId` no row answers to.
 */
export const LOCAL_ID_PREFIX = 'local-'

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX)
}

export type MessageAuthor = { id: string; name: string; role: UserRole }

export type MessageDraft = {
  /** Local; see `LOCAL_ID_PREFIX`. */
  id: string
  body: string
  author: MessageAuthor
  replyTo?: Message | null
  attachments?: MessageAttachment[]
  /** Defaults to now. Named so a test can fix it. */
  sentAt?: string
}

/** How much of a quoted message a reply's preview carries. Matches the API's own. */
const REPLY_PREVIEW_LENGTH = 140

/**
 * The bubble a send puts on screen before the API has answered for it.
 *
 * It is shaped as a `Message` because that is what a thread renders, and it
 * carries `receiptStatus: 'sent'` because the type demands one — a lie that is
 * never read, since a bubble showing a `DeliveryState` shows that instead of a
 * receipt. The server's answer replaces this whole object rather than patching
 * it, so nothing invented here outlives the round trip.
 */
export function draftMessage(draft: MessageDraft): Message {
  const attachments = draft.attachments ?? []
  const base = {
    id: draft.id,
    body: draft.body,
    messageType: attachments.length > 0 ? ('media' as const) : ('text' as const),
    createdAt: draft.sentAt ?? new Date().toISOString(),
    replyTo: draft.replyTo
      ? { id: draft.replyTo.id, preview: draft.replyTo.body.slice(0, REPLY_PREVIEW_LENGTH) }
      : null,
    reactions: [],
    attachments,
    receiptStatus: 'sent' as const,
  }

  return draft.author.role === 'customer'
    ? { ...base, fromCompany: false }
    : { ...base, sender: { id: draft.author.id, name: draft.author.name, role: draft.author.role } }
}

/**
 * A send begins, or begins again.
 *
 * Keyed by id so a retry re-marks the message already on screen rather than
 * stacking a second copy of it beneath the first.
 */
export function beginSend(state: ThreadState, message: Message): ThreadState {
  return {
    ...state,
    unsent: [
      ...state.unsent.filter((entry) => entry.message.id !== message.id),
      { message, state: 'sending' },
    ],
  }
}

/**
 * The API's answer to a send, folded into the thread.
 *
 * The echo is dropped in the same step the real message is merged, so the bubble
 * is replaced rather than briefly doubled — the two have different ids and
 * nothing else would ever remove the first.
 *
 * The merge is a merge and not an append because the answer can arrive after a
 * page that already contains it: a refresh that overlapped the send comes back
 * with the server's copy, and folding by id means the second arrival replaces
 * the first instead of showing the person their message twice.
 */
export function applySentMessage(
  state: ThreadState,
  localId: string,
  sent: Message,
): ThreadState {
  return {
    ...state,
    messages: mergeMessages(state.messages, [sent]),
    unsent: state.unsent.filter((entry) => entry.message.id !== localId),
  }
}

/**
 * A send that did not land.
 *
 * The message stays where the person put it, marked, rather than vanishing —
 * what they wrote is not the API's to discard, and a thread that quietly loses a
 * bubble is indistinguishable from one that delivered it.
 */
export function failSend(state: ThreadState, localId: string): ThreadState {
  return {
    ...state,
    unsent: state.unsent.map((entry) =>
      entry.message.id === localId ? { ...entry, state: 'failed' } : entry,
    ),
  }
}

export function findUnsent(
  state: ThreadState,
  localId: string,
): UnsentMessage | undefined {
  return state.unsent.find((entry) => entry.message.id === localId)
}

/** Everything the thread shows: what the API confirmed, and what is still on its way. */
export function threadMessages(state: ThreadState): Message[] {
  return mergeMessages(
    state.messages,
    state.unsent.map((entry) => entry.message),
  )
}

/** Shared so a settled thread hands its bubbles the same map every render. */
const NOTHING_UNSENT: ReadonlyMap<string, DeliveryState> = new Map()

/** How far each unconfirmed message has got, for the bubbles that render them. */
export function deliveryStates(
  unsent: UnsentMessage[],
): ReadonlyMap<string, DeliveryState> {
  if (unsent.length === 0) return NOTHING_UNSENT
  return new Map(unsent.map((entry) => [entry.message.id, entry.state]))
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
