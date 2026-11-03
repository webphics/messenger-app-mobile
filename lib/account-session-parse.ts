import { asRecord } from '@/lib/api-envelope'
import type { AccountSession } from '@/lib/types'

/**
 * Reading the session payloads for this person's own account.
 *
 * Pure and separate from the requests, for the reason every other parser here
 * is: what the API sends becomes a table of cases rather than something only a
 * running server can demonstrate.
 *
 * The rule about what is required is `lib/user-parse`'s. A row in this list is
 * something somebody acts *on*, and the one thing the acting needs is the id
 * that `POST /sessions/:id/revoke` is addressed to, so a row without a usable
 * one is dropped rather than drawn as a device with a control that could not
 * possibly work. Everything else falls back, because the alternative to a
 * missing login method is a device that vanishes from a list somebody is
 * reading to find out whether anyone else is signed in as them.
 *
 * `isCurrent` falls back to false, which is the safe direction and the one the
 * rest of this feature is built on: a row that lost the flag draws a revoke it
 * did not need, and one that gained it would silently take the revoke off a
 * device somebody wants to end. See `lib/account-session-rows`.
 */

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    return record ? [record] : []
  })
}

export function parseAccountSession(value: unknown): AccountSession | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  if (!id) return null

  return {
    id,
    // Empty rather than a placeholder: what an unnamed device is called in
    // front of a person is a presentation decision, and it is made once in
    // `lib/account-session-rows` rather than here.
    deviceName: text(record.deviceName) ?? '',
    deviceType: text(record.deviceType) ?? '',
    userAgent: text(record.userAgent),
    ipAddress: text(record.ipAddress),
    loginMethod: text(record.loginMethod),
    isCurrent: record.isCurrent === true,
    createdAt: text(record.createdAt) ?? '',
    updatedAt: text(record.updatedAt) ?? '',
  }
}

/**
 * One page of `GET /sessions`, which answers
 * `{ rows, total, page, pageSize, activeOtherSessionCount }`.
 *
 * Null for a body that is not that shape, and null again for a page of rows
 * this build could read none of. The second is `lib/community-rows`' refusal
 * rather than the empty list `lib/user-parse` answers with, and for a sharper
 * reason than that one has: the caller of this request is by definition signed
 * in, so their own session is in every page of active ones. A page that came
 * back with rows and yielded nothing readable is therefore a shape this client
 * cannot read, and answering an empty list would tell somebody they are signed
 * in nowhere at the moment they are asking whether anybody else is.
 *
 * An honestly empty `rows` stays an empty list, because refusing that would
 * turn a legitimate answer into an error, and the screen has a state for it.
 */
export function parseAccountSessions(value: unknown): AccountSession[] | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.rows)) return null

  const sessions = records(record.rows).flatMap((item) => {
    const session = parseAccountSession(item)
    return session ? [session] : []
  })

  if (record.rows.length > 0 && sessions.length === 0) return null
  return sessions
}

/**
 * A `{ revoked }` or `{ revokedCount }` body, from the two revoke routes.
 *
 * `lib/user-parse`'s `parseUserAcknowledgement` is the pattern, and the
 * reasoning is the same: nothing reads the number back, because the status code
 * already said it worked and the screen removes the rows it asked about rather
 * than counting what came home. What this answers is that the envelope was well
 * formed, which is what separates an acknowledgement from a body this client
 * could not parse at all.
 */
export function parseAccountSessionAcknowledgement(value: unknown): true | null {
  return asRecord(value) ? true : null
}
