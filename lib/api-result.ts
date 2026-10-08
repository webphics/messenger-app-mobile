import { asRecord } from '@/lib/api-envelope'
import type { HttpOutcome } from '@/lib/auth-response'

/**
 * What an API call answers with, for every endpoint this app talks to.
 *
 * Lifted out of `lib/conversation-api` when the second family of endpoints
 * arrived — organizations, users, inboxes — because the envelope, the four
 * failures and the way a 2xx becomes a value are properties of the API rather
 * than of conversations. Every module that adds paths reads them through this,
 * so there is one answer to "what does a refusal look like" and one place a
 * screen learns it.
 *
 * Nothing throws. A screen gets back either a value or one of four failures,
 * and the four exist because a screen answers each of them differently: a
 * request that never arrived offers a retry, an expired session sends the
 * person to sign in, a refusal has something to say, and a body this client
 * cannot read is a bug worth showing as one rather than as an empty list.
 */

export type ApiFailure =
  | { kind: 'unreachable' }
  /** The session is gone. Only a 401 means this; a 403 is a verdict on the request. */
  | { kind: 'unauthorised' }
  /**
   * `code` is the API's own name for the refusal, where it gave one. Almost
   * nothing reads it — the message is what a person is shown — but a refusal
   * whose sentence this client would rather write itself can be told apart by it.
   */
  | { kind: 'refused'; message: string; code?: string }
  | { kind: 'malformed' }

export type ApiResult<T> = { ok: true; value: T } | { ok: false; failure: ApiFailure }

const DEFAULT_REFUSAL = 'The server could not answer that right now. Try again.'

function refusalMessage(body: unknown): string {
  const message = asRecord(body)?.message
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : DEFAULT_REFUSAL
}

/**
 * Refusal codes whose sentence this client writes itself, in place of the
 * API's. Every refusal passes through `refused` below, so a code worded here
 * reads the same on every screen that shows it.
 *
 * Only the codes that need it. The API's sentences are already written for a
 * person and most screens repeat them; the conversation reasons a composer
 * shows before anything is sent are worded in `lib/conversation-access`.
 *
 * `message_not_deletable` answers a delete of a system notice, or of an
 * attachment on one. This client has no Delete, so nothing sends one today.
 */
const CLIENT_WORDING: ReadonlyMap<string, string> = new Map([
  ['message_not_deletable', 'System notices cannot be deleted, and neither can their attachments.'],
])

/** A refusal, carrying the API's code only when it sent one. */
function refused(body: unknown): ApiFailure {
  const code = asRecord(body)?.code
  if (typeof code !== 'string' || code === '') {
    return { kind: 'refused', message: refusalMessage(body) }
  }
  return { kind: 'refused', message: CLIENT_WORDING.get(code) ?? refusalMessage(body), code }
}

/**
 * The envelope every API response wraps its payload in. A body that is not an
 * envelope is malformed rather than empty: the difference matters, because an
 * empty list is a legitimate answer and a broken body is not.
 */
function envelopeData(body: unknown): { data: unknown } | null {
  const envelope = asRecord(body)
  return envelope && 'data' in envelope ? { data: envelope.data } : null
}

/**
 * One outcome, read into a result.
 *
 * `parse` answers null for a payload it could not read, which is the only way
 * this can produce `malformed` from a 2xx — every parser this app has is total
 * for the shapes the API documents.
 */
export function readOutcome<T>(
  outcome: HttpOutcome,
  parse: (data: unknown) => T | null,
): ApiResult<T> {
  if (!outcome.reached) return { ok: false, failure: { kind: 'unreachable' } }
  if (outcome.status === 401) return { ok: false, failure: { kind: 'unauthorised' } }
  if (outcome.status < 200 || outcome.status >= 300) {
    return { ok: false, failure: refused(outcome.body) }
  }

  const envelope = envelopeData(outcome.body)
  if (!envelope) return { ok: false, failure: { kind: 'malformed' } }

  const value = parse(envelope.data)
  return value === null ? { ok: false, failure: { kind: 'malformed' } } : { ok: true, value }
}

/** A query string, or nothing at all. Undefined values are absent keys rather than empty ones. */
export function query(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value === undefined ? [] : [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`],
  )
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`
}

/**
 * The answer to a request nothing reads back.
 *
 * The envelope is still checked, so a body this client cannot make sense of is
 * still `malformed` — what is dropped is only the row inside it.
 */
export function acknowledged(): void {
  return undefined
}

/**
 * The sentence a screen prints for a failed write, `fallback` for a body this
 * client could not read.
 *
 * An expired session says nothing, the convention every write in this app
 * follows: the auth layer is already on its way to sign-in, and a sentence
 * about the write would arrive on a screen that is leaving.
 */
export function refusalSentence(failure: ApiFailure, fallback: string): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return fallback
}
