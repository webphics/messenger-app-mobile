import { authenticatedRequest } from '@/lib/auth-service'
import { asRecord } from '@/lib/api-envelope'
import {
  parseAttachment,
  parseConversation,
  parseConversations,
  parseLabels,
  parseMessage,
  parseMessages,
  parseNote,
  parseNotes,
  parseOrganizations,
  parseStaffDirectory,
} from '@/lib/conversation-parse'
import { UNSUPPORTED_TYPE_MESSAGE, uploadMimeType } from '@/lib/attachment-upload'
import { storedAttachment } from '@/lib/attachment-view'
import type { HttpOutcome } from '@/lib/auth-response'
import type {
  AttachmentView,
  Conversation,
  ConversationNote,
  ConversationType,
  Label,
  Message,
  MessageAttachment,
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
  /** Trimmed by the caller. The API refuses a message with neither body nor attachments. */
  body: string
  /** The message being answered, when the composer had a reply open. */
  replyToMessageId?: string
  /**
   * Already uploaded. Every URL here names an object the API stored, which is
   * what `uploadAttachment` answers with — a device URI would be accepted by the
   * schema and then be unreachable from every other device.
   */
  attachments?: MessageAttachment[]
  /** `text` unless said otherwise; see `sendMessageType`. */
  messageType?: 'text' | 'media' | 'voice'
}

/**
 * Write one text message to a thread.
 *
 * The API answers with the message it stored, so what comes back is what every
 * other device will see — a server id, the server's timestamp, and a receipt.
 * That is what the thread keeps; the bubble the composer put on screen is only
 * ever a stand-in for it.
 *
 * Attachments name objects the API already holds. `uploadAttachment` is what
 * puts them there, and it runs first: a send is the last step of an attachment's
 * journey rather than the start of it, so a message never reaches a thread
 * pointing at a file only one device can open.
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
        // `body` is optional on the schema and `min(1)` when present, so an
        // attachment sent without a caption omits the key rather than sending
        // the empty string the composer had.
        ...(draft.body === '' ? {} : { body: draft.body }),
        messageType: draft.messageType ?? 'text',
        ...(draft.replyToMessageId ? { replyToMessageId: draft.replyToMessageId } : {}),
        ...(draft.attachments && draft.attachments.length > 0
          ? { attachments: draft.attachments.map(sendableAttachment) }
          : {}),
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
 * learns the effect happened. `lib/conversation-list`'s `withConversationRead`
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
 * Put this person's reaction on a message, or take it off again.
 *
 * Two endpoints rather than one, because the API models it as two, and one
 * reaction per person per message either way: an add replaces whatever they
 * reacted with before rather than joining it, which is the rule
 * `toggleReaction` already encodes on this side. So the caller works out what a
 * tap means and these only carry it.
 *
 * Both answer with the message as it now stands, reactions included — the same
 * DTO a page carries — so the answer merges into the thread by id like any other
 * copy of that message. The API broadcasts the same message to everyone else in
 * the conversation, which is how their bubbles learn about it.
 */
export async function addReaction(
  id: string,
  messageId: string,
  emoji: string,
): Promise<ApiResult<Message>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/reactions`,
    { method: 'POST', body: { emoji } },
  )
  return readOutcome(outcome, parseMessage)
}

export async function removeReaction(
  id: string,
  messageId: string,
): Promise<ApiResult<Message>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/reactions`,
    { method: 'DELETE' },
  )
  return readOutcome(outcome, parseMessage)
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

/**
 * Engage an unassigned Support DM. The API's `engage` action.
 *
 * Answers with the conversation as it now stands — engaged, with the caller as
 * its assignee — which is what a list folds in so the composer opens without a
 * refetch. Staff only, and only inside the caller's own organizations; a thread
 * somebody reached first is refused with `already_engaged` rather than silently
 * reassigned, and that refusal is worth showing, because the person is about to
 * write in a thread that is no longer theirs.
 */
export async function engageConversation(id: string): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/engage`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * Take a Support DM away from whoever holds it. The API's `takeover` action.
 *
 * Admin only — `assertCanTakeOver` in the API's `conversations.policy.ts` begins
 * with `assertAdmin`, and an Agent asking for this is answered `403` whatever
 * the thread's state. So nothing offers it to an Agent; see
 * `lib/composer-access.ts`, which is where that rule is written down.
 *
 * The dispossessed assignee is told separately and directly, over
 * `conversation.reassigned` — see `lib/realtime-events.ts`.
 */
export async function takeOverConversation(id: string): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/takeover`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseConversation)
}


/**
 * The attachment schema a send takes, which is not the one a message answers with.
 *
 * `AttachmentDtoSchema` is `.nullable()` on the optional fields and
 * `SendMessageSchema`'s copy is `.optional()`, so the null a parsed message
 * carries for "the API did not say" would be refused on the way back in. Each
 * one is dropped rather than translated: there is no third state, and an absent
 * key and a null mean the same thing to both ends.
 */
function sendableAttachment(attachment: MessageAttachment): Record<string, unknown> {
  return {
    type: attachment.type,
    url: attachment.url,
    ...(attachment.fileName == null ? {} : { fileName: attachment.fileName }),
    ...(attachment.size == null ? {} : { size: attachment.size }),
    ...(attachment.durationSeconds == null
      ? {}
      : { durationSeconds: attachment.durationSeconds }),
    ...(attachment.waveform == null || attachment.waveform.length === 0
      ? {}
      : { waveform: attachment.waveform }),
  }
}

/**
 * Put one file this device holds into the API's object store.
 *
 * Multipart, to `POST /conversations/:id/files` — the endpoint the web client
 * uploads through, under the same field name (`file`) and the same allowlist.
 * The file is streamed from disk rather than read into this process's memory,
 * which is not what `fetch` would do with it; see
 * `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`.
 *
 * The answer names the stored object, and `storedAttachment` puts back the three
 * things a file cannot carry: a voice note's duration, its waveform, and the
 * name somebody chose.
 *
 * A type the allowlist does not hold is refused before the upload rather than
 * after it — the client cannot send a file it has no type to declare, and the
 * refusal is worth more early than late. `rejectUploadReason` is the same rule
 * one step earlier still, at the composer, where it can be acted on; this is the
 * floor beneath it. Either way the caller gets `refused`, in the same shape the
 * API's own refusal takes, so one path handles all three.
 */
export async function uploadAttachment(
  conversationId: string,
  attachment: AttachmentView,
): Promise<ApiResult<MessageAttachment>> {
  const type = uploadMimeType(attachment)
  if (!type) {
    return { ok: false, failure: { kind: 'refused', message: UNSUPPORTED_TYPE_MESSAGE } }
  }

  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(conversationId)}/files`,
    { method: 'POST', file: { uri: attachment.uri, field: UPLOAD_FIELD, type } },
  )

  const result = readOutcome(outcome, parseAttachment)
  if (!result.ok) return result

  return { ok: true, value: storedAttachment(result.value, attachment) }
}

/** The multipart field `FileInterceptor('file', …)` reads on the API. */
const UPLOAD_FIELD = 'file'

/**
 * Every label a staff member may put on a conversation.
 *
 * Organization-wide rather than per-conversation: the same set is offered on
 * every thread, and which of them a thread wears is on the conversation itself —
 * `Conversation.labels`, which the list endpoint already carries. Staff only;
 * a Customer is refused.
 */
export async function listLabels(): Promise<ApiResult<Label[]>> {
  return readOutcome(await authenticatedRequest('/conversations/labels'), parseLabels)
}

/**
 * Put a label on a conversation, or take one off.
 *
 * Both answer with the conversation as it now stands, labels included, which is
 * what goes back into the shared list — so a label added here is on the row in
 * the inbox behind without a refetch, exactly as an Engage is.
 */
export async function attachLabel(
  id: string,
  labelId: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/labels`,
    { method: 'POST', body: { labelId } },
  )
  return readOutcome(outcome, parseConversation)
}

export async function detachLabel(
  id: string,
  labelId: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/labels/${encodeURIComponent(labelId)}`,
    { method: 'DELETE' },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * The internal notes on a Support DM.
 *
 * Notes exist only on a Support DM — the API answers `404` for any other
 * conversation type — and only for staff. The caller decides whether to ask;
 * this only knows how.
 */
export async function listNotes(id: string): Promise<ApiResult<ConversationNote[]>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/notes`,
  )
  return readOutcome(outcome, parseNotes)
}

/**
 * Write one.
 *
 * Text only. The API also takes a `messageId`, which is what the web client's
 * note-on-a-message affordance sends and what its "Jump to message" reads back —
 * neither of which this client has, so nothing here would have one to pass.
 */
export async function createNote(
  id: string,
  text: string,
): Promise<ApiResult<ConversationNote>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/notes`,
    { method: 'POST', body: { text } },
  )
  return readOutcome(outcome, parseNote)
}
