import { authenticatedRequest } from '@/lib/auth-service'
import { acknowledged, query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import {
  parseAttachment,
  parseContacts,
  parseConversation,
  parseConversations,
  parseLabel,
  parseLabels,
  parseMessage,
  parseMessageHistory,
  parseMessageReceipts,
  parseMessages,
  parseNote,
  parseNotes,
  parseOrganizations,
  parseStaffDirectory,
} from '@/lib/conversation-parse'
import { UNSUPPORTED_TYPE_MESSAGE, uploadMimeType } from '@/lib/attachment-upload'
import { storedAttachment } from '@/lib/attachment-view'
import type {
  AttachmentView,
  Contact,
  Conversation,
  ConversationNote,
  ConversationType,
  Label,
  LabelColor,
  Message,
  MessageAttachment,
  MessageHistory,
  MessageReceipts,
  Organization,
  StaffDirectoryUser,
} from '@/lib/types'

/**
 * The conversation endpoints, over the one transport this app has — and, since
 * #58, the push-device one beside them, which is not a conversation endpoint but
 * is the same authenticated call and gains nothing from a module of its own.
 *
 * Everything here goes through `authenticatedRequest`, so the Session cookie and
 * the CSRF pair are handled exactly as they are for signing in, and a cookie the
 * server has stopped accepting ends the session once for all of them rather than
 * at each call site. This module adds paths, not a second way of talking to the
 * API.
 *
 * The envelope, the four failures and the query builder are `lib/api-result`'s,
 * shared with every other family of endpoints. The two types are re-exported
 * here because this module was where they lived first and most of the app still
 * names them through it.
 */

export type { ApiFailure, ApiResult } from '@/lib/api-result'

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
 * A Customer's Support DM in one organization, found or created, for staff holding
 * `message_customers`. The staff side of `ensureSupportConversation`, and the call the web
 * client makes for the same thing. `organizationId` is needed only when the two share more than
 * one organization; the schema is `.strict()`, so an undefined value has to be an absent key.
 */
export async function startCustomerConversation(
  customerId: string,
  organizationId?: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest('/conversations/support/with-customer', {
    method: 'POST',
    body: { customerId, ...(organizationId ? { organizationId } : {}) },
  })
  return readOutcome(outcome, parseConversation)
}

/**
 * Everyone this person can begin a conversation with.
 *
 * The one directory that answers for all three roles, which is why the People
 * screen reads it rather than assembling the same list from three endpoints: a
 * Customer receives their organizations as companies, an Agent receives the
 * Customers whose Support DMs they can see plus the rest of the staff, and an
 * Admin receives the whole directory. Each row already names the thread that
 * exists between the two, where one does.
 *
 * `q` is the API's own filter. It is sent as well as filtering on this side,
 * because an Admin's directory is the whole user table and the phone should not
 * be the thing narrowing it.
 */
export async function listContacts(q?: string): Promise<ApiResult<Contact[]>> {
  const trimmed = q?.trim()
  const path = `/conversations/contacts${query({ q: trimmed === '' ? undefined : trimmed })}`
  return readOutcome(await authenticatedRequest(path), parseContacts)
}

/**
 * Start a group.
 *
 * Admin only — `POST /conversations/groups` is `@Roles(['admin'])`, and an
 * Agent asking is answered `403` whatever they put in the body, so nothing
 * offers it to one. The members are named at creation and at least one is
 * required; the organization is what the group belongs to and what its members
 * have to share.
 *
 * Answers with the conversation, like every other get-or-create here, so the
 * row joins the shared list and the thread opens without a refetch.
 */
export async function createGroup(draft: {
  title: string
  description?: string
  memberIds: string[]
  organizationId: string
}): Promise<ApiResult<Conversation>> {
  const description = draft.description?.trim()
  const outcome = await authenticatedRequest('/conversations/groups', {
    method: 'POST',
    // `.strict()`, so an empty description is an absent key rather than an
    // empty string the schema would take at face value.
    body: {
      title: draft.title,
      ...(description ? { description } : {}),
      memberIds: draft.memberIds,
      organizationId: draft.organizationId,
    },
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
  /**
   * Trimmed by the caller. The API refuses a message with no body, no
   * attachments and no Post.
   */
  body: string
  /** The message being answered, when the composer had a reply open. */
  replyToMessageId?: string
  /**
   * The Post this message is about (a Reply to a Post). Enough on its own: the
   * API takes a message that is only a Post, with no body and no attachments.
   */
  wallPostId?: string
  /**
   * Already uploaded. Every URL here names an object the API stored, which is
   * what `uploadAttachment` answers with — a device URI would be accepted by the
   * schema and then be unreachable from every other device.
   */
  attachments?: MessageAttachment[]
  /** `text` unless said otherwise; see `sendMessageType`. */
  messageType?: 'text' | 'media' | 'voice'
  /**
   * Marks the message as a Complaint: a Customer, in their own General Support, about one of
   * their organizations, or null for the app itself. Only the Customer and Admins read it.
   */
  complaint?: { organizationId: string | null }
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
        ...(draft.wallPostId ? { wallPostId: draft.wallPostId } : {}),
        ...(draft.complaint ? { complaint: draft.complaint } : {}),
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

/**
 * Rewrites the body of a message this person sent.
 *
 * Author-only on the API, and only within its fifteen-minute window. The API
 * sends both as the message's `editableUntil`, and `messageActions` in
 * `lib/conversation-access` reads it so the menu item is absent rather than
 * offered and refused. Answers the whole updated `Message`, the same shape a reaction
 * does, so it merges into the thread by id like any other copy of it.
 *
 * The body is sent untrimmed by no one: the caller trims, because the sheet has
 * to decide whether Save is even enabled from the same string.
 */
export async function editMessage(
  id: string,
  messageId: string,
  body: string,
): Promise<ApiResult<Message>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'PATCH', body: { body } },
  )
  return readOutcome(outcome, parseMessage)
}

/**
 * Who has read one message, and when.
 *
 * Sender-only on the API: asking about somebody else's message answers 403
 * rather than an empty list, so the control that opens this screen is gated on
 * the same rule rather than left to discover it.
 */
export async function fetchMessageReceipts(
  id: string,
  messageId: string,
): Promise<ApiResult<MessageReceipts>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/receipts`,
  )
  return readOutcome(outcome, parseMessageReceipts)
}

/**
 * Every wording one message has had, oldest first, ending with its current
 * body. Open to everyone who can read the message; the API leaves the writer
 * out for a Customer, so nothing here branches on a role.
 */
export async function fetchMessageHistory(
  id: string,
  messageId: string,
): Promise<ApiResult<MessageHistory>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/history`,
  )
  return readOutcome(outcome, parseMessageHistory)
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
 * the thread's state. So the API never sends an Agent the `take_over` way out
 * in the conversation's `access`; see `lib/conversation-access.ts`.
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
 * Hand a Support DM to another Agent. The API's `transfer` action.
 *
 * Only the assignee may, only while the thread is engaged, and only to an
 * Agent who is not already holding it, per `assertCanTransfer`. Whether this
 * viewer is offered it arrives as `access.actions.transfer`, read through
 * `threadActionsView` in `lib/conversation-access`. An Admin bypasses the
 * capability check but not the assignee one: an Admin who wants somebody
 * else's thread takes it over first.
 *
 * Answers with the conversation as it now stands, so the row goes into the
 * shared list and the composer closes behind the person who gave it away.
 */
export async function transferConversation(
  id: string,
  agentId: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/transfer`,
    { method: 'POST', body: { agentId } },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * Close a Support DM. The API's `close` action.
 *
 * The assignee's, like Transfer, and for the same reason: it ends the work,
 * and the person who did the work is the one who knows it is done. Not final —
 * the Customer writing in reopens it, and it returns to whoever closed it —
 * which is why nothing here treats it as destructive.
 *
 * The summary is required: the API rejects a close without one (`min: 1`) and
 * keeps it with the thread for staff, never for the Customer. Trimmed by the
 * caller, as the web client does.
 */
export async function closeConversation(
  id: string,
  summary: string,
): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/close`,
    { method: 'POST', body: { summary } },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * Reopen a closed Support DM. The API's `reopen` action.
 *
 * No body: closing asks what the support was, reopening only says the thread is
 * not finished. Gated on the `close` capability rather than on holding the
 * thread, because the close most worth undoing may be one whose author has
 * left. A thread somebody else reopened first is refused with
 * `conversation_not_closed`.
 */
export async function reopenConversation(id: string): Promise<ApiResult<Conversation>> {
  const outcome = await authenticatedRequest(
    `/conversations/${encodeURIComponent(id)}/reopen`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseConversation)
}

/**
 * Define a label, rename one, or retire one.
 *
 * Admin only — both routes are `@Roles(['admin'])` — and organization-wide:
 * the same set is offered on every thread, so this is a change to the
 * vocabulary rather than to any one conversation.
 *
 * Archiving is the retirement, and it is not a delete: an archived label stays
 * on the threads already wearing it, because removing it from those would
 * rewrite what somebody recorded. `offerableLabels` is what stops it being
 * offered again.
 */
export async function createLabel(
  name: string,
  color: LabelColor,
): Promise<ApiResult<Label>> {
  const outcome = await authenticatedRequest('/conversations/labels', {
    method: 'POST',
    body: { name, color },
  })
  return readOutcome(outcome, parseLabel)
}

export async function updateLabel(
  labelId: string,
  changes: { name?: string; color?: LabelColor; archived?: boolean },
): Promise<ApiResult<Label>> {
  const outcome = await authenticatedRequest(
    `/conversations/labels/${encodeURIComponent(labelId)}`,
    {
      method: 'PATCH',
      // `.strict()` and "at least one", so each absent key is a field left
      // alone rather than one cleared.
      body: {
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.color === undefined ? {} : { color: changes.color }),
        ...(changes.archived === undefined ? {} : { archived: changes.archived }),
      },
    },
  )
  return readOutcome(outcome, parseLabel)
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

/** Which half of the API's `platform` a registration comes from. */
export type PushPlatform = 'android' | 'ios'

/**
 * Register this installation's Expo push token, so a closed app can be reached.
 *
 * Mobile's own route, not the browser subscription one beside it: that takes a
 * VAPID `PushSubscription` and an `ExponentPushToken` satisfies none of its
 * shape. See `docs/adr/ADR-0009-mobile-push-is-a-second-transport.md`.
 *
 * Idempotent on the token, which is what makes it safe to send on every launch
 * — and necessary to, because a token rotates and a row holding an old one
 * dispatches into nothing. Fire-and-forget in the sense the Store's writes are:
 * every failure here is one of the ordinary four, and no screen handles any of
 * them.
 */
export async function registerPushDevice(
  token: string,
  platform: PushPlatform,
): Promise<ApiResult<void>> {
  const outcome = await authenticatedRequest('/push/devices', {
    method: 'POST',
    body: { token, platform },
  })
  return readOutcome(outcome, acknowledged)
}
