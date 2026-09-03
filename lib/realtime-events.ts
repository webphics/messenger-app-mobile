import { asRecord } from '@/lib/api-envelope'
import { parseConversation, parseMessage } from '@/lib/conversation-parse'
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
  /** Outbound: asks the server to put this socket in the conversation's room. */
  conversationJoin: 'conversation.join',
  conversationLeave: 'conversation.leave',
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

/** A conversation that no longer exists. Nothing is left to fetch for it. */
export function parseConversationDeleted(payload: unknown): string | null {
  const record = asRecord(payload)
  if (!record) return null

  const id = record.conversationId
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * How many message ids the filter below remembers.
 *
 * Comfortably more than a burst of traffic can carry between two glances at the
 * screen, and small enough that the cost of holding it is nothing. A message
 * evicted from it and then delivered again would be counted twice; a
 * conversation that busy has already had the count corrected by the next
 * resync.
 */
const REMEMBERED_MESSAGES = 200

/**
 * Delivery is at-least-once, and this is what makes it once.
 *
 * The API emits `message.created` to a single socket more than once — observed
 * against the running server, with one listener on one connection, for a message
 * sent once. Every consumer of an event is not safely idempotent: folding a
 * message into a thread by id is, but adding one to a conversation's unread
 * count is not, and a duplicate there is a badge that says two where the thread
 * shows one.
 *
 * So the duplicate is dropped at the seam, once, rather than left for each
 * consumer to defend against separately. Bounded because a connection can live
 * for days: the oldest id is forgotten to make room, which is safe — a duplicate
 * arrives within milliseconds of its original, never two hundred messages later.
 */
export function createSeenMessages(limit: number = REMEMBERED_MESSAGES) {
  const order: string[] = []
  const ids = new Set<string>()

  return {
    /** True the first time an id is offered, false every time after. */
    isNew(id: string): boolean {
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
