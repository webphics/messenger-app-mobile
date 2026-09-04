import { authenticatedRequest } from '@/lib/auth-service'
import { asRecord } from '@/lib/api-envelope'
import {
  parseConversation,
  parseConversations,
  parseMessage,
  parseMessages,
  parseOrganizations,
  parseStaffDirectory,
} from '@/lib/conversation-parse'
import type { HttpOutcome } from '@/lib/auth-response'
import type {
  Conversation,
  ConversationType,
  Message,
  Organization,
  StaffDirectoryUser,
} from '@/lib/types'

/**
 * The conversation endpoints, over the one transport this app has.
 *
 * Everything here goes through `authenticatedRequest`, so the Session cookie and
 * the CSRF pair are handled exactly as they are for signing in, and a cookie the
 * server has stopped accepting ends the session once for all of them rather than
 * at each call site. This module adds paths, not a second way of talking to the
 * API.
 *
 * Nothing throws. A screen gets back either a value or one of four failures, and
 * the four exist because a screen answers each of them differently: a request
 * that never arrived offers a retry, an expired session sends the person to sign
 * in, a refusal has something to say, and a body this client cannot read is a
 * bug worth showing as one rather than as an empty inbox.
 */

export type ApiFailure =
  | { kind: 'unreachable' }
  /** The session is gone. Only a 401 means this; a 403 is a verdict on the request. */
  | { kind: 'unauthorised' }
  | { kind: 'refused'; message: string }
  | { kind: 'malformed' }

export type ApiResult<T> = { ok: true; value: T } | { ok: false; failure: ApiFailure }

const DEFAULT_REFUSAL = 'The server could not answer that right now. Try again.'

function refusalMessage(body: unknown): string {
  const message = asRecord(body)?.message
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : DEFAULT_REFUSAL
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
 * this can produce `malformed` from a 2xx — every parser in
 * `lib/conversation-parse` is total for the shapes the API documents.
 */
function readOutcome<T>(outcome: HttpOutcome, parse: (data: unknown) => T | null): ApiResult<T> {
  if (!outcome.reached) return { ok: false, failure: { kind: 'unreachable' } }
  if (outcome.status === 401) return { ok: false, failure: { kind: 'unauthorised' } }
  if (outcome.status < 200 || outcome.status >= 300) {
    return { ok: false, failure: { kind: 'refused', message: refusalMessage(outcome.body) } }
  }

  const envelope = envelopeData(outcome.body)
  if (!envelope) return { ok: false, failure: { kind: 'malformed' } }

  const value = parse(envelope.data)
  return value === null
    ? { ok: false, failure: { kind: 'malformed' } }
    : { ok: true, value }
}

function query(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value === undefined ? [] : [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`],
  )
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`
}

/** The most messages one page may hold. The API refuses anything larger. */
export const MESSAGE_PAGE_LIMIT = 50

/** Every conversation the signed-in person may see, newest activity first. */
export async function listConversations(
  params: { type?: ConversationType } = {},
): Promise<ApiResult<Conversation[]>> {
  const outcome = await authenticatedRequest(`/conversations${query({ type: params.type })}`)
  return readOutcome(outcome, parseConversations)
}

export async function getConversation(id: string): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(`/conversations/${encodeURIComponent(id)}`)
  return readOutcome(outcome, parseConversation)
}

/**
 * Every other staff member this person could hold a DM with.
 *
 * Staff only: a Customer is refused, which is a refusal rather than an empty
 * directory, because the two would otherwise be indistinguishable on screen.
 * Each row names the organizations the pair share, which is what
 * `createStaffDm` binds to and what says whether a DM can exist at all.
 */
export async function listStaffDirectory(): Promise<ApiResult<StaffDirectoryUser[]>> {
  return readOutcome(await authenticatedRequest('/conversations/staff'), parseStaffDirectory)
}

/**
 * The staff DM with one person, created if this is the first.
 *
 * Get-or-create, like `ensureSupportConversation`: tapping a name in the
 * directory resumes the thread that already exists rather than starting a
 * second one beside it.
 *
 * `organizationId` is what the pair's DM binds to. It is omitted when the
 * caller has nothing to say, which is the common case — the API binds silently
 * when exactly one shared organization exists, and refuses with something worth
 * reading when there are several. The schema is `.strict()`, so an undefined
 * value has to be an absent key.
 */
export async function createStaffDm(
  userId: string,
  organizationId?: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest('/conversations/staff', {
    method: 'POST',
    body: { userId, ...(organizationId ? { organizationId } : {}) },
  })
  return readOutcome(outcome, parseConversation)
}

/**
 * The Customer's support thread with one organization, created if it is their first.
 *
 * Get-or-create rather than create: the API answers with the existing
 * conversation when there is one, so a screen can call this on open without
 * first asking whether the person has ever written in.
 */
export async function ensureSupportConversation(
  organizationId: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest('/conversations/support', {
    method: 'POST',
    body: { organizationId },
  })
  return readOutcome(outcome, parseConversation)
}

/**
 * One page of a thread, oldest message first.
 *
 * `cursor` is the id of the oldest message already held: the API answers with
 * the page immediately *before* it, which is what scrolling up asks for.
 */
export async function listMessages(
  id: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<ApiResult<Message[]>> {
  const path = `/conversations/${encodeURIComponent(id)}/messages${query({
    cursor: options.cursor,
    limit: options.limit ?? MESSAGE_PAGE_LIMIT,
  })}`
  return readOutcome(await authenticatedRequest(path), parseMessages)
}

export type SendMessageDraft = {
  /** Trimmed by the caller; the API refuses an empty one. */
  body: string
  /** The message being answered, when the composer had a reply open. */
  replyToMessageId?: string
}

/**
 * Write one text message to a thread.
 *
 * The API answers with the message it stored, so what comes back is what every
 * other device will see — a server id, the server's timestamp, and a receipt.
 * That is what the thread keeps; the bubble the composer put on screen is only
 * ever a stand-in for it.
 *
 * Text only. `SendMessageSchema` takes attachments too, but they name uploaded
 * objects rather than the device URIs Phase 5a produces, so a message carrying
 * one has nowhere to go until upload arrives.
 */
export async function sendMessage(
  id: string,
  draft: SendMessageDraft,
): Promise<ApiResult<Message>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      // The schema is `.strict()`, so a key it does not know refuses the whole
      // request — `replyToMessageId` is omitted rather than sent as undefined.
      body: {
        body: draft.body,
        messageType: 'text',
        ...(draft.replyToMessageId ? { replyToMessageId: draft.replyToMessageId } : {}),
      },
    },
  )
  return readOutcome(outcome, parseMessage)
}

/**
 * Tell the API this conversation has been read.
 *
 * The answer is the conversation, but it arrives with `unreadCount: null` like
 * every row from outside the list endpoint, so there is nothing in it worth
 * merging: what a caller wants from this is the effect, and `ok` is how it
 * learns the effect happened. `lib/conversation-state`'s `withConversationRead`
 * is what says so on screen, ahead of this and independently of it.
 */
export async function markConversationRead(id: string): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/read`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * The organizations the signed-in person belongs to.
 *
 * A Customer's support conversation is per-organization, so this is what names
 * the organization to get-or-create one with — and what titles the row, since a
 * Customer's Support DM payload carries no title of its own.
 */
export async function listMyOrganizations(): Promise<ApiResult<Organization[]>> {
  return readOutcome(await authenticatedRequest('/memberships/mine'), parseOrganizations)
}
