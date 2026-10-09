import { asRecord } from '@/lib/api-envelope'
import type {
  Broadcast,
  BroadcastAcknowledgement,
  BroadcastAcknowledgementReport,
  BroadcastAudience,
} from '@/lib/types'

/**
 * Reading the Broadcast payloads.
 *
 * Pure, and separate from the requests, for the reason `lib/canned-reply-parse`
 * is: a row this client cannot read is dropped from a list rather than failing
 * the page, and a body whose list is not a list at all is malformed rather than
 * empty, so a history this build cannot read is never drawn as "nothing sent".
 */

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

function audience(value: unknown): BroadcastAudience {
  const record = asRecord(value)
  return {
    userIds: ids(record?.userIds),
    groupIds: ids(record?.groupIds),
    communityIds: ids(record?.communityIds),
    organizationIds: ids(record?.organizationIds),
  }
}

export function parseBroadcast(value: unknown): Broadcast | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const title = text(record.title)
  const body = text(record.body)
  const sentAt = text(record.sentAt)
  if (!id || !title || !body || !sentAt) return null

  return {
    id,
    title,
    body,
    essential: record.essential === true,
    requiresAcknowledgement: record.requiresAcknowledgement === true,
    audience: audience(record.audience),
    recipientCount: count(record.recipientCount),
    acknowledgedCount: count(record.acknowledgedCount),
    createdByName: text(asRecord(record.createdBy)?.name),
    sentAt,
  }
}

/** A page of history: an array, newest first. Anything else is malformed. */
export function parseBroadcasts(value: unknown): Broadcast[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap((row) => {
    const parsed = parseBroadcast(row)
    return parsed ? [parsed] : []
  })
}

function acknowledgement(value: unknown): BroadcastAcknowledgement | null {
  const record = asRecord(value)
  const userId = text(record?.userId)
  if (!record || !userId) return null
  return {
    userId,
    name: text(asRecord(record.user)?.name),
    acknowledgedAt: text(record.acknowledgedAt),
  }
}

export function parseAcknowledgementReport(value: unknown): BroadcastAcknowledgementReport | null {
  const record = asRecord(value)
  const broadcastId = text(record?.broadcastId)
  if (!record || !broadcastId || !Array.isArray(record.recipients)) return null

  return {
    broadcastId,
    requiresAcknowledgement: record.requiresAcknowledgement === true,
    recipientCount: count(record.recipientCount),
    acknowledgedCount: count(record.acknowledgedCount),
    recipients: record.recipients.flatMap((row) => {
      const parsed = acknowledgement(row)
      return parsed ? [parsed] : []
    }),
  }
}
