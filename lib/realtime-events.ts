import { asRecord } from '@/lib/api-envelope'
import {
  parseConversation,
  parseMessage,
  parseStaffDirectoryUser,
} from '@/lib/conversation-parse'
import type { Reassignment, ReassignmentReason } from '@/lib/conversation-list'
import type { Conversation, Message } from '@/lib/types'

/**
 * What the API says over the socket, read into this app's types.
 *
 * Pure, and separate from the connection that carries it, so the events are a
 * table of payloads rather than something only a running server can
 * demonstrate. The payloads are the API's `conversations.realtime.ts` names and
 * the same DTOs the REST endpoints answer with, so the bodies go through
 * `lib/conversation-parse` unchanged — an event and a fetched page describe the
 * same message, and reading them two different ways is how the two would drift.
 *
 * Every parser answers null for a payload it cannot read, and the socket layer
 * drops those. A malformed event is not worth ending a connection over: the next
 * one is a moment away, and a reconnect resyncs from REST regardless.
 */

/** The API's Socket.IO namespace. Joined to the base URL, never configured separately. */
export const REALTIME_NAMESPACE = '/realtime'

export const REALTIME_EVENTS = {
  messageCreated: 'message.created',
  conversationUpdated: 'conversation.updated',
  conversationDeleted: 'conversation.deleted',
  conversationReassigned: 'conversation.reassigned',
  /** Outbound: asks the server to put this socket in the conversation's room. */
  conversationJoin: 'conversation.join',
  conversationLeave: 'conversation.leave',
  /**
   * A Post created, edited, reacted to, or removed — on its own per-organization
   * room (`wall:<organizationId>`, or `wall:admin` for an Admin's socket), joined
   * automatically from the same live membership resolution the support queue
   * rooms use. Never a conversation room, and never alongside `messageCreated`: a
   * Post is not a Message.
   */
  postCreated: 'post.created',
  postUpdated: 'post.updated',
  postRemoved: 'post.removed',
  /**
   * A notification row written for this person, on the same connection and the
   * same per-person room as everything else here — the API's one dispatch path
   * for anything this app has not built a dedicated event for. Read narrowly:
   * see `parseGroupJoinRequestAnswered`.
   */
  notificationCreated: 'notification.created',
} as const

export type MessageCreated = {
  conversationId: string
  message: Message
}

/**
 * A message someone wrote, as it reaches everyone else.
 *
 * The conversation id travels beside the message rather than on it, because a
 * message payload has never carried one — the REST path knows the conversation
 * from the URL it asked, and this is the socket's replacement for that.
 */
export function parseMessageCreated(payload: unknown): MessageCreated | null {
  const record = asRecord(payload)
  if (!record) return null

  const conversationId = record.conversationId
  if (typeof conversationId !== 'string' || conversationId === '') return null

  const message = parseMessage(record.message)
  return message === null ? null : { conversationId, message }
}

/**
 * A conversation row that has changed.
 *
 * Carries the whole row, in the same shape the list endpoint sends — except for
 * `unreadCount`, which the API answers as null everywhere but the list. So this
 * updates a row's preview and ordering and never its count; the count moves on
 * `message.created`. See `withIncomingMessage`.
 */
export function parseConversationUpdated(payload: unknown): Conversation | null {
  const record = asRecord(payload)
  return record ? parseConversation(record.conversation) : null
}

const REASSIGNMENT_REASONS: readonly ReassignmentReason[] = [
  'taken_over',
  'transferred',
  'membership_revoked',
]

/**
 * A conversation taken out of the recipient's hands.
 *
 * Addressed rather than broadcast: the API emits this to one user room, the
 * *previous* assignee's, and to nobody else. So the recipient is always the
 * person who has just lost the thread, which is what lets `withReassignment`
 * read it as being about them without the payload naming them.
 *
 * It is not the only word a staff session gets about a Takeover — a
 * `conversation.updated` carrying the new assignee follows it to every staff
 * socket in the organization, and that is what moves everyone *else's* list.
 * This one exists because of the case where that broadcast cannot arrive: a
 * revoked membership pulls the person out of the organization's rooms first, so
 * the update is emitted past them and this is all they are told.
 *
 * Answers a `Reassignment` — the domain's shape, not a second one beside it —
 * so nothing has to translate between the two on the way to the list, and part
 * of the payload is dropped in doing so. `engagedStaff` and `engagedStaffCount`
 * name everyone who has ever held the thread, which the web client shows on the
 * screen it puts up in place of the lost conversation; nothing here asks who
 * came before. The assignee's `role` goes the same way: a conversation row names
 * an assignee and never says what they are.
 */
export function parseConversationReassigned(payload: unknown): Reassignment | null {
  const record = asRecord(payload)
  if (!record) return null

  const conversationId = record.conversationId
  if (typeof conversationId !== 'string' || conversationId === '') return null

  const reason = REASSIGNMENT_REASONS.find((value) => value === record.reason)
  if (!reason) return null

  // Nobody, both when the API says null and when it says something unreadable:
  // either way this client does not know who holds it, and the
  // `conversation.updated` that follows a Takeover carries the row anyway.
  const assignee = parseStaffDirectoryUser(record.currentAssignee)

  return {
    conversationId,
    reason,
    assignee: assignee && { id: assignee.id, name: assignee.name },
  }
}

/** A conversation that no longer exists. Nothing is left to fetch for it. */
export function parseConversationDeleted(payload: unknown): string | null {
  const record = asRecord(payload)
  if (!record) return null

  const id = record.conversationId
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * A Post as it travels over `post.created` and `post.updated`, unparsed.
 *
 * The envelope is `{ organizationId, post }` and `post` is the same shape
 * `POST /wall/posts` answers in `data` — but reading it into a `WallPost` is
 * `lib/wall-parse`'s job, and that module is one this file must not reach for:
 * `lib/wall-launch-isolation` walks the imports of every launch entry point,
 * this file included, and fails if any of them can reach a Wall module. So the
 * shape of a Post's fields is checked only at the point something actually
 * draws one — this is a boundary the Wall itself parses across, not one the
 * realtime layer resolves for it. `organizationId` is dropped: the default Wall
 * is every organization a reader belongs to, room membership has already
 * scoped which sockets receive the event at all, and nothing here filters
 * further by it.
 */
function parsePostEnvelope(payload: unknown): { post: unknown } | null {
  const record = asRecord(payload)
  if (!record) return null
  return asRecord(record.post) ? { post: record.post } : null
}

export const parsePostCreated = parsePostEnvelope
export const parsePostUpdated = parsePostEnvelope

/** A Post taken down or deleted. Nothing is left to fetch for it. */
export function parsePostRemoved(payload: unknown): { postId: string } | null {
  const record = asRecord(payload)
  if (!record) return null

  const postId = record.postId
  return typeof postId === 'string' && postId !== '' ? { postId } : null
}

/**
 * The two kinds this app reads off `notification.created` (#88): a Group join
 * request of the asking person's own was answered.
 *
 * Not `group_join_requested` — that one is for whoever may answer a request,
 * and answering stays off the phone. Everything else `notification.created`
 * carries a kind for is a notification this app already learns about another
 * way (a message, a reassignment) and has nothing further to do with here.
 */
const JOIN_REQUEST_ANSWERED_KINDS = new Set([
  'group_join_request_approved',
  'group_join_request_declined',
])

/**
 * A `notification.created` payload read for the one thing a listener needs:
 * is this a Group join request of the viewer's own being answered, and which
 * Group was it about.
 *
 * `groupId` is the API's `conversationId` on this notification shape — the
 * Group a tap on it would open — and it is only ever present on an approval;
 * a decline opens nothing, so the API sends none and this answers `null`. A
 * feed holding that Group as `joinable_group` is the one worth re-reading; a
 * decline, carrying no id to match against, cannot be narrowed the same way
 * and is read by every mounted feed — see `useCommunityFeed`.
 */
export function parseGroupJoinRequestAnswered(
  payload: unknown,
): { groupId: string | null } | null {
  const notification = asRecord(asRecord(payload)?.notification)
  const kind = notification?.kind
  if (typeof kind !== 'string' || !JOIN_REQUEST_ANSWERED_KINDS.has(kind)) return null

  const groupId = notification?.conversationId
  return { groupId: typeof groupId === 'string' && groupId !== '' ? groupId : null }
}

/**
 * How many message ids the tally below remembers.
 *
 * Comfortably more than a burst of traffic can carry between two glances at the
 * screen, and small enough that the cost of holding it is nothing. A message
 * evicted from it and then broadcast again would be counted twice; a
 * conversation that busy has already had the count corrected by the next
 * resync.
 */
const REMEMBERED_MESSAGES = 200

/**
 * Which messages have already been counted as unread.
 *
 * One message arrives on `message.created` more than once, and the repeats are
 * not duplicates: the API broadcasts a message when it is written and again
 * each time its receipt advances — measured against the running server as two
 * events about a second apart, the first carrying `receiptStatus: "sent"` and
 * the second `"delivered"`. That is how a tick moves from sent to delivered to
 * read on a bubble without anyone refreshing, and the thread wants every one of
 * them: `mergeMessages` folds them in by id, so the later copy replaces the
 * earlier rather than joining it.
 *
 * An unread count is the one reader that cannot take them all, because adding
 * is not idempotent — a receipt advancing would raise a badge that the thread
 * shows nothing new for. So this is not a filter on delivery, which would swallow
 * the receipts; it is the list's own memory of what it has already counted.
 *
 * Bounded, because a connection can live for days: the oldest id is forgotten
 * to make room, which is safe — the repeats of a message arrive within seconds
 * of it, never two hundred messages later.
 */
export function createCountedMessages(limit: number = REMEMBERED_MESSAGES) {
  const order: string[] = []
  const ids = new Set<string>()

  return {
    /** True the first time an id is offered — the once it is worth counting. */
    isFirst(id: string): boolean {
      if (ids.has(id)) return false

      ids.add(id)
      order.push(id)
      if (order.length > limit) {
        const evicted = order.shift()
        if (evicted !== undefined) ids.delete(evicted)
      }
      return true
    },
  }
}
