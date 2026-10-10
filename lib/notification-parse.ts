import { asRecord } from '@/lib/api-envelope'
import type { AppNotification, NotificationSettings } from '@/lib/types'

/**
 * Reading the notification settings document.
 *
 * Pure and separate from the request for the reason `lib/org-parse` is: what the
 * API sends becomes a table of cases rather than something only a running server
 * can demonstrate.
 *
 * One rule differs from the list parsers next door, and it is the one this
 * setting turns on. Every field here falls back to the *quiet* answer rather
 * than to nothing: a list this client could not read is an empty list, and a
 * flag that did not arrive is false. A settings document is a standing answer
 * about who may interrupt somebody, and a shape this build cannot read must
 * never be able to invent permission — the switch reads off, the person turns on
 * what they want, and the write that follows says so plainly. Refusing the whole
 * document instead would leave the card unable to draw at all over a payload
 * that has simply grown a field.
 */

/** The ids in a list field, ignoring anything that is not a usable one. */
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

export function parseNotificationSettings(value: unknown): NotificationSettings | null {
  const record = asRecord(value)
  if (!record) return null

  return {
    broadcastOptOut: record.broadcastOptOut === true,
    mutedConversationIds: ids(record.mutedConversationIds),
    postOrganizationIds: ids(record.postOrganizationIds),
  }
}

/** A field that is a usable id, or null — an empty string is not one. */
function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * One row of the feed, or null when it cannot be drawn.
 *
 * The id, the kind and the time are what a row cannot do without — it is keyed,
 * routed and grouped on them — so a row missing any of those is dropped rather
 * than drawn wrong. A title or body that did not arrive is an empty line, and a
 * reference that did not arrive opens nothing, which is the quiet answer again.
 */
export function parseNotification(value: unknown): AppNotification | null {
  const record = asRecord(value)
  if (!record) return null

  const id = optionalId(record.id)
  const kind = optionalId(record.kind)
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : null
  if (!id || !kind || !createdAt || Number.isNaN(Date.parse(createdAt))) return null

  return {
    id,
    kind,
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    conversationId: optionalId(record.conversationId),
    broadcastId: optionalId(record.broadcastId),
    wallPostId: optionalId(record.wallPostId),
    readAt: typeof record.readAt === 'string' && record.readAt !== '' ? record.readAt : null,
    createdAt,
  }
}

/**
 * A page of the feed. Not a list at all is `null`, so a body this build cannot
 * read is `malformed` rather than an empty feed; rows inside it that cannot be
 * read are dropped one at a time.
 */
export function parseNotifications(value: unknown): AppNotification[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap((item) => {
    const notification = parseNotification(item)
    return notification ? [notification] : []
  })
}

/** `{ count }`, as the unread count and both mark-read routes answer. */
export function parseUnreadCount(value: unknown): number | null {
  const count = asRecord(value)?.count
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null
}
