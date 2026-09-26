import { asRecord } from '@/lib/api-envelope'
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
 * `composerView` for the composer and `messageActions` for what one message
 * offers. Later tickets add the thread actions and Delete here.
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

/** What a read-only viewer may do to write here, when the API lets them. */
export const WAY_OUTS = ['engage', 'take_over', 'reopen'] as const
export type WayOut = (typeof WAY_OUTS)[number]

/** Who holds a Support DM. Sent with `already_engaged` and `must_take_over` only. */
export type AccessHolder = { id: string; name: string }

export type WriteAccess =
  | { state: 'open' }
  | {
      state: 'read_only'
      reason: WriteReason
      holder: AccessHolder | null
      wayOut: WayOut | null
    }

/**
 * The offered actions, one boolean each. `editMessages` is the first: on when
 * the viewer may write here and the conversation is not a closed Support DM.
 * Later tickets add the rest.
 */
export type AccessActions = { editMessages: boolean }

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

function writeAccess(value: unknown): WriteAccess | null {
  const record = asRecord(value)
  if (!record) return null
  if (record.state === 'open') return { state: 'open' }
  if (record.state !== 'read_only') return null

  const reason = oneOf(record.reason, WRITE_REASONS)
  const held = optional(record.holder, holder)
  const wayOut = optional(record.wayOut, (raw) => oneOf(raw, WAY_OUTS))
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
  if (!record || typeof record.editMessages !== 'boolean') return null
  return { editMessages: record.editMessages }
}

/**
 * The payload's `access`, or unknown.
 *
 * Strict on purpose. A reason or a way out this build does not know is a rule
 * it cannot word, and guessing would offer a composer or a button the API may
 * refuse, so any part that does not read makes the whole answer unknown.
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

/** What one message offers in the long-press menu. Later tickets add Delete. */
export type MessageActionsView = { edit: boolean }

/**
 * What this message offers this viewer at `now`.
 *
 * Edit needs the conversation's `editMessages`, which the API turns off where
 * the viewer may not write and in a closed Support DM, and `now` strictly
 * before the message's `editableUntil`, which covers authorship, message type,
 * broadcasts and the fifteen-minute window. At exactly `editableUntil` the API
 * refuses, so the menu does too.
 *
 * The one fact only this client knows: a message with a local id has not
 * reached the API yet and has nothing there to edit. Retry or delete is the
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
  if (!access || !isKnownAccess(access) || !access.actions.editMessages) return { edit: false }
  if (isLocalId(message.id) || message.editableUntil === null) return { edit: false }

  const until = Date.parse(message.editableUntil)
  return { edit: !Number.isNaN(until) && now < until }
}
