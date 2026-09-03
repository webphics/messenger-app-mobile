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
