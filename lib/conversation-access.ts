import { asRecord } from '@/lib/api-envelope'
import type { ApiFailure } from '@/lib/api-result'
import { isLocalId } from '@/lib/thread-state'
import type { GroupWritePolicy, Message } from '@/lib/types'

/**
 * The Conversation access adapter: what this viewer may do in a conversation,
 * as the API told us, and what each surface shows for it.
 *
 * The API computes access for each viewer and sends it on every conversation
 * payload: the list, the single conversation and the per-viewer
 * `conversation.updated` event. See root `docs/adr/0015-the-api-says-what-a-viewer-may-do-in-a-conversation.md`.
 * This module reads that answer and turns it into wording and buttons. It does
 * not decide who may write, engage, take over or reopen. Role, viewer id and the
 * Shared queue switch are the API's inputs now, not this client's.
 *
 * This client used to mirror the API's conversation policy here by hand, and
 * the reason it gave still holds: a composer must not invite a message, accept
 * it, mark it as sending and then fail it, because the person has already
 * written the thing by the time the app admits it was never going to be sent.
 * The answer now arrives with the conversation, so there is no round trip to
 * wait for and nothing to mirror.
 *
 * A conversation without a readable `access` is unknown: a row restored from a
 * Store written before the field existed, or an API that has not deployed it
 * yet. Unknown renders as read-only with a neutral "updating" reason and no way
 * out, until the launch refetch replaces the row. There is no fallback to the
 * old client-side rules.
 *
 * Two entry points: `parseAccess` for the payload, and a view per surface:
 * `composerView` for the composer, `threadActionsView` for what may be done
 * to the thread, `detailsView` for labels and notes on Conversation details,
 * and `messageActions` for what one message offers. `refusalMeansStale` is
 * the one rule about the other direction: whether a refused write means the
 * copy these views were drawn from is out of date.
 */

/** Why a viewer may only read, in the API's own refusal codes. */
export const WRITE_REASONS = [
  'must_engage',
  'already_engaged',
  'must_take_over',
  'group_write_restricted',
  'broadcast_inbox_read_only',
  'conversation_closed',
] as const
export type WriteReason = (typeof WRITE_REASONS)[number]

/**
 * A read-only reason the API added after this build. The conversation is
 * still read-only; this build only cannot say why in the API's own terms.
 */
export const UNRECOGNISED_REASON = 'unrecognised'
export type ReadOnlyReason = WriteReason | typeof UNRECOGNISED_REASON

/** What a read-only viewer may do to write here, when the API lets them. */
export const WAY_OUTS = ['engage', 'take_over', 'reopen'] as const
export type WayOut = (typeof WAY_OUTS)[number]

/** Who holds a Support DM. Sent with `already_engaged` and `must_take_over` only. */
export type AccessHolder = { id: string; name: string }

export type WriteAccess =
  | { state: 'open' }
  | {
      state: 'read_only'
      reason: ReadOnlyReason
      holder: AccessHolder | null
      wayOut: WayOut | null
    }

/**
 * The offered actions this build knows, one boolean each, in the API's names.
 *
 * `editMessages` is on when the viewer may write here and the conversation is
 * not a closed Support DM. The thread actions come from the API's rulings with
 * the viewer's Capabilities, which this client never sees: `close` and
 * `reopen` need the Close Capability, `transfer` the Transfer Capability and
 * being the assignee, `engage` an Unassigned Support DM, `takeOver` an Admin on
 * one somebody else holds, and `setPriority` any staff member who can see a
 * Support DM. All of them are off for a Customer, and `engage`, `takeOver` and
 * `transfer` are off in a Shared queue. This client has no priority control, so
 * `setPriority` is read and offered nowhere.
 *
 * `manageLabels` needs the label Capability and means attaching and detaching
 * labels on this conversation. `readNotes` and `writeNotes` are on only in a
 * Support DM, for staff who can see its notes. Every staff action is off for a
 * Customer.
 *
 * `deleteMessages` is read by `messageActions`, beside each message's own
 * `deletable`. `setWritePolicy`, `setJoinPolicy` and `deleteConversation` are
 * parsed and offered nowhere: this client has no Group policy control and no
 * conversation delete. They are still required, like every action here, so an
 * answer this build reads is always a whole one.
 */
export const ACCESS_ACTIONS = [
  'editMessages',
  'engage',
  'takeOver',
  'transfer',
  'close',
  'reopen',
  'setPriority',
  'manageLabels',
  'readNotes',
  'writeNotes',
  'setWritePolicy',
  'setJoinPolicy',
  'deleteMessages',
  'deleteConversation',
] as const
export type AccessAction = (typeof ACCESS_ACTIONS)[number]
export type AccessActions = Record<AccessAction, boolean>

/** `access` as the API sends it, read into this client's type. */
export type KnownAccess = { write: WriteAccess; actions: AccessActions }

/** No `access` this build can read. Renders as read-only and updating. */
export type UnknownAccess = { kind: 'unknown' }

export type ConversationAccess = KnownAccess | UnknownAccess

export const UNKNOWN_ACCESS: UnknownAccess = { kind: 'unknown' }

export function isKnownAccess(access: ConversationAccess): access is KnownAccess {
  return 'write' in access
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

/** Absent and null are both "none". Anything else must read, or the whole answer is unknown. */
function optional<T>(value: unknown, read: (value: unknown) => T | null): T | null | undefined {
  if (value === undefined || value === null) return null
  return read(value) ?? undefined
}

function holder(value: unknown): AccessHolder | null {
  const record = asRecord(value)
  const id = text(record?.id)
  const name = text(record?.name)
  return id && name ? { id, name } : null
}

/**
 * A reason this build knows, or `unrecognised` for any other non-empty string.
 * `unrecognised` reads back as itself, so the Store's round trip holds.
 */
function readOnlyReason(value: unknown): ReadOnlyReason | null {
  if (!text(value)) return null
  return oneOf(value, WRITE_REASONS) ?? UNRECOGNISED_REASON
}

/** A way out this build knows, or none for any other string. */
function wayOutOf(value: unknown): WayOut | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  return oneOf(value, WAY_OUTS)
}

function writeAccess(value: unknown): WriteAccess | null {
  const record = asRecord(value)
  if (!record) return null
  if (record.state === 'open') return { state: 'open' }
  if (record.state !== 'read_only') return null

  const reason = readOnlyReason(record.reason)
  const held = optional(record.holder, holder)
  const wayOut = wayOutOf(record.wayOut)
  if (!reason || held === undefined || wayOut === undefined) return null

  return { state: 'read_only', reason, holder: held, wayOut }
}

/**
 * The actions this build knows, each a boolean, or null. An action the API
 * added after this build is dropped rather than failing the whole answer: not
 * offering something this build cannot word or wire is the safe side.
 */
function accessActions(value: unknown): AccessActions | null {
  const record = asRecord(value)
  if (!record) return null

  const actions = {} as AccessActions
  for (const action of ACCESS_ACTIONS) {
    const offered = record[action]
    if (typeof offered !== 'boolean') return null
    actions[action] = offered
  }
  return actions
}

/**
 * The payload's `access`, or unknown.
 *
 * Strict about shape, lenient about new words. A missing or malformed part (no
 * write, a state other than open or read-only, a reason that is not a string,
 * a malformed holder, a known action missing or not a boolean) makes the whole
 * answer unknown. A reason or a way out the API added after this build is not
 * a broken shape (story 33): an unknown reason reads as read-only for a reason
 * this build cannot name, and an unknown way out as none. Both are the safe
 * side: no composer and no button the API may refuse, and no build stuck on
 * "updating" until it is upgraded.
 *
 * Reading its own output gives the same answer, which is what lets the Store
 * persist the parsed conversation and read it back through the same parser.
 */
export function parseAccess(value: unknown): ConversationAccess {
  const record = asRecord(value)
  if (!record) return UNKNOWN_ACCESS

  const write = writeAccess(record.write)
  const actions = accessActions(record.actions)
  if (!write || !actions) return UNKNOWN_ACCESS

  return { write, actions }
}

/** A button that gets a read-only viewer to a composer. */
export type WayOutButton = {
  wayOut: WayOut
  /** The web client's words, so the two products agree. */
  label: string
}

export type ComposerView =
  | { kind: 'open' }
  | { kind: 'read-only'; reason: string; wayOut: WayOutButton | null }

/** Facts about the conversation that change the wording and never the answer. */
export type ComposerPresentation = {
  /** A Group's Write policy, so a restricted Group can say who does write. */
  writePolicy?: GroupWritePolicy | null
}

const WAY_OUT_LABELS: Record<WayOut, string> = {
  engage: 'Engage chat',
  take_over: 'Take over',
  reopen: 'Reopen conversation',
}

const UPDATING = 'Updating this conversation…'

/**
 * A Group's wording mirrors the web client's copy (messenger-app#58's
 * `composerLockedNamed` / `composerLockedAdmins`). Anything but `named` gets
 * the admins wording, the safer of the two: `everyone` should never be
 * restricted, and a policy this build could not read says nothing either way.
 */
function reasonText(
  write: Extract<WriteAccess, { state: 'read_only' }>,
  presentation: ComposerPresentation,
): string {
  switch (write.reason) {
    case 'must_engage':
      return 'Engage this conversation to reply.'
    case 'already_engaged':
      return write.holder
        ? `${write.holder.name} is handling this conversation.`
        : 'Another agent is handling this conversation.'
    case 'must_take_over':
      return 'Take over this conversation to reply.'
    case 'group_write_restricted':
      return presentation.writePolicy === 'named'
        ? 'Only the members chosen for this group can send messages here.'
        : "Only this group's admins can send messages here."
    case 'broadcast_inbox_read_only':
      return 'Announcements are posted by the team.'
    case 'conversation_closed':
      return 'This conversation is closed.'
    case UNRECOGNISED_REASON:
      return "You can't send messages here right now."
  }
}

/**
 * What sits where the composer goes: the composer, or why there is none and
 * the button out of it when the API offers one.
 *
 * Takes `undefined` as unknown too, so a conversation that somehow reached a
 * screen without passing through `parseConversation` cannot open a composer.
 */
export function composerView(
  access: ConversationAccess | undefined,
  presentation: ComposerPresentation = {},
): ComposerView {
  if (!access || !isKnownAccess(access)) {
    return { kind: 'read-only', reason: UPDATING, wayOut: null }
  }

  const { write } = access
  if (write.state === 'open') return { kind: 'open' }

  return {
    kind: 'read-only',
    reason: reasonText(write, presentation),
    wayOut: write.wayOut ? { wayOut: write.wayOut, label: WAY_OUT_LABELS[write.wayOut] } : null,
  }
}

/**
 * What a staff member may do to a thread, as opposed to in it. Engage and
 * Take over are offered where the composer goes, as its way out; Transfer,
 * Close and Reopen on Conversation details. Priority is not here: this client
 * has no control for it.
 */
export type ThreadActionsView = {
  engage: boolean
  takeOver: boolean
  transfer: boolean
  close: boolean
  reopen: boolean
}

const NO_THREAD_ACTIONS: ThreadActionsView = {
  engage: false,
  takeOver: false,
  transfer: false,
  close: false,
  reopen: false,
}

/**
 * The thread actions the API offers this viewer, and nothing else.
 *
 * No role, viewer id or Shared queue switch goes in: the API already asked
 * those questions, and the Capabilities behind Close and Transfer are ones this
 * client cannot see. A button drawn from this answer is one the API accepts
 * when the conversation has not changed underneath it. Unknown access, or none,
 * offers nothing.
 */
export function threadActionsView(access: ConversationAccess | undefined): ThreadActionsView {
  if (!access || !isKnownAccess(access)) return NO_THREAD_ACTIONS

  const { engage, takeOver, transfer, close, reopen } = access.actions
  return { engage, takeOver, transfer, close, reopen }
}

/**
 * What Conversation details offers beside the thread actions: editing labels,
 * the notes on the thread, and the field to add one.
 *
 * `labels` is the API's `manageLabels`, which offers attaching and detaching.
 * It does not decide whether applied labels are shown: those are drawn
 * read-only from the payload for anyone it carries them to. Reading notes and
 * writing them are separate answers, so a viewer who may read and not write
 * sees the notes without the field.
 */
export type DetailsView = {
  labels: boolean
  readNotes: boolean
  writeNotes: boolean
}

const NO_DETAILS: DetailsView = { labels: false, readNotes: false, writeNotes: false }

/**
 * The labels and notes the API offers this viewer on this conversation.
 *
 * No role or conversation type goes in. The label Capability is one this
 * client never sees, and whether a conversation keeps notes is the API's rule
 * (Support DMs only). Unknown access, or none, offers nothing.
 */
export function detailsView(access: ConversationAccess | undefined): DetailsView {
  if (!access || !isKnownAccess(access)) return NO_DETAILS

  const { manageLabels, readNotes, writeNotes } = access.actions
  return { labels: manageLabels, readNotes, writeNotes }
}

/** What one message offers in the long-press menu. */
export type MessageActionsView = { edit: boolean; delete: boolean }

const NO_MESSAGE_ACTIONS: MessageActionsView = { edit: false, delete: false }

/**
 * What this message offers this viewer at `now`.
 *
 * Edit needs the conversation's `editMessages`, which the API turns off where
 * the viewer may not write and in a closed Support DM, and `now` strictly
 * before the message's `editableUntil`, which covers authorship, message type,
 * broadcasts and the fifteen-minute window. At exactly `editableUntil` the API
 * refuses, so the menu does too.
 *
 * Delete needs the conversation's `deleteMessages` and the message's own
 * `deletable`, which is `ConversationsPolicy.canDeleteMessage` for this viewer:
 * any author's message with `delete_messages`, only their own with
 * `delete_own_messages`, never for a Customer. A System notice is refused to
 * everyone with `message_not_deletable`, so it is not offered even on a payload
 * that says otherwise, which is the web client's rule too.
 *
 * The one fact only this client knows: a message with a local id has not
 * reached the API yet and has nothing there to edit or delete. Retry is the
 * remedy for one of those.
 *
 * `now` is a parameter so one pass judges every row against one instant, and
 * so the boundary can be tested. Unknown access offers nothing.
 */
export function messageActions(
  access: ConversationAccess | undefined,
  message: Message,
  now: number,
): MessageActionsView {
  if (!access || !isKnownAccess(access) || isLocalId(message.id)) return NO_MESSAGE_ACTIONS

  const remove =
    access.actions.deleteMessages && message.deletable === true && message.messageType !== 'system'

  if (!access.actions.editMessages || message.editableUntil === null) {
    return { edit: false, delete: remove }
  }
  const until = Date.parse(message.editableUntil)
  return { edit: !Number.isNaN(until) && now < until, delete: remove }
}

/**
 * Whether the long-press menu offers "Add note" on this message.
 *
 * Exactly the conversation's `writeNotes`, which the API sends only on a
 * Support DM and only to staff who may write its notes, so an org DM, a Group
 * and every Customer get none. The one fact only this client knows is the
 * same as `messageActions`': a message with a local id has not reached the API,
 * so there is nothing there for a note to point at.
 */
export function messageNoteOffered(
  access: ConversationAccess | undefined,
  message: Message,
): boolean {
  if (!access || !isKnownAccess(access) || isLocalId(message.id)) return false
  return access.actions.writeNotes
}

/**
 * The API's refusal codes that say the conversation changed after this device
 * read it, so the copy on screen offered something the API no longer allows.
 *
 * - The six read-only reasons (`WRITE_REASONS`): somebody engaged, took over,
 *   closed, restricted the Group, or the viewer is in an announcements thread
 *   the copy did not show as one.
 * - `conversation_not_closed`: a Reopen after somebody else reopened it.
 * - `support_assignment_disabled`: the Shared queue switch went off. The
 *   session is re-read for this too; see `refusedWriteFollowUp` in
 *   `lib/conversation-failure`.
 * - `missing_capability`: a Capability was revoked, which sends no
 *   conversation event, so `actions` on the copy is out of date.
 * - `message_not_deletable`: Delete was offered on a copy that should not
 *   have offered it (`messageActions`).
 * - `conversation_not_found` and `forbidden`: how the API's rulings answer the
 *   common races. A Close or Transfer after somebody else took or closed the
 *   thread is a 404, and a Take over on a thread the viewer already holds is
 *   `forbidden`. When the refetch answers 404 too, the thread is gone or no
 *   longer visible: the write path hands that failure back to its caller and
 *   never feeds it into this rule again, so it cannot loop.
 *
 * Not here: `conversation_reassigned`. The viewer lost the thread and can no
 * longer read it, so a refetch answers the same refusal. The socket's
 * `conversation.reassigned` event already moves the row (`withReassignment`
 * in `lib/conversation-list`).
 */
const STALE_REFUSALS: ReadonlySet<string> = new Set([
  ...WRITE_REASONS,
  'conversation_not_closed',
  'support_assignment_disabled',
  'missing_capability',
  'message_not_deletable',
  'conversation_not_found',
  'forbidden',
])

/**
 * Whether a refused conversation write means this device's copy of the
 * conversation is stale, so the caller should fetch that one conversation
 * again. The fresh copy carries the viewer's `access`, which is what moves the
 * composer and the actions to the new state.
 *
 * False for every other failure: a validation error or any other code is about
 * the request, not the conversation, and a request that never arrived, an
 * expired session or an unreadable body says nothing about the conversation.
 */
export function refusalMeansStale(failure: ApiFailure): boolean {
  return failure.kind === 'refused' && failure.code !== undefined && STALE_REFUSALS.has(failure.code)
}
