import { asRecord } from '@/lib/api-envelope'
import type { NotificationSettings } from '@/lib/types'

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
