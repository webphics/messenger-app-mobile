import { asRecord } from '@/lib/api-envelope'
import type { CannedReply } from '@/lib/types'

/**
 * Reading the saved-response payloads.
 *
 * Pure, and separate from the requests, for the reason `lib/org-parse` is. The
 * same two rules hold: a row this client cannot read is dropped from a list
 * rather than failing the page, and everything a row needs is required, since
 * a saved response with no organization, title or body is not one anybody
 * could send.
 *
 * The body is kept exactly as it arrived. Its line breaks are part of what the
 * admin saved, and the API has already trimmed it.
 */

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function parseCannedReply(value: unknown): CannedReply | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const organizationId = text(record.organizationId)
  const title = text(record.title)
  const body = text(record.body)
  if (!id || !organizationId || !title || !body) return null

  return { id, organizationId, title, body, archived: record.archived === true }
}

/**
 * `{ rows: CannedReply[] }`. A body with no `rows` array is malformed rather
 * than empty: an empty library is a real answer that draws the "add one" screen,
 * and a shape this build cannot read must not be drawn as that.
 */
export function parseCannedReplies(value: unknown): CannedReply[] | null {
  const rows = asRecord(value)?.rows
  if (!Array.isArray(rows)) return null

  return rows.flatMap((row) => {
    const parsed = parseCannedReply(row)
    return parsed ? [parsed] : []
  })
}

/** `{ deleted: boolean }`, read as whether the row is gone. */
export function parseCannedReplyDeleted(value: unknown): boolean | null {
  const deleted = asRecord(value)?.deleted
  return typeof deleted === 'boolean' ? deleted : null
}
