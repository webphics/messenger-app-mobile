import { asRecord } from '@/lib/api-envelope'
import { parseAccess } from '@/lib/conversation-access'
import type {
  Contact,
  ContactKind,
  Conversation,
  ConversationNote,
  ConversationPerson,
  ConversationStaffPerson,
  ConversationType,
  GroupWritePolicy,
  Label,
  LabelColor,
  Message,
  MessageAttachment,
  MessageReaction,
  MessageReceipt,
  MessageReceipts,
  MessageReplyTo,
  MessageType,
  Organization,
  ReceiptStatus,
  StaffDirectoryUser,
  SupportStatus,
  UserRole,
} from '@/lib/types'

/**
 * Reading the API's conversation payloads into this app's types.
 *
 * Pure, and separate from the requests that fetch them, so that what the API
 * sends is a table of cases rather than something only a running server can
 * demonstrate. Every parser here answers null for a payload it cannot read, and
 * the list parsers drop the rows that answered null rather than failing the
 * whole page: one unreadable row in a list of forty is not a reason to show a
 * person nothing.
 *
 * What is required is what the app would be inventing if it defaulted: an id, an
 * organization, a conversation type, a message timestamp. Everything else falls
 * back, because the alternative to a missing preview is a row that vanishes
 * rather than a row that reads as empty.
 */

const CONVERSATION_TYPES: readonly ConversationType[] = [
  'support_dm',
  'staff_dm',
  'group',
  'broadcast_inbox',
]

const SUPPORT_STATUSES: readonly SupportStatus[] = ['unassigned', 'engaged', 'closed']
const WRITE_POLICIES: readonly GroupWritePolicy[] = ['everyone', 'admins', 'named']
const MESSAGE_TYPES: readonly MessageType[] = ['text', 'media', 'voice', 'system']
const RECEIPT_STATUSES: readonly ReceiptStatus[] = ['sent', 'delivered', 'read']
const ROLES: readonly UserRole[] = ['admin', 'agent', 'customer']
const CONTACT_KINDS: readonly ContactKind[] = ['company', 'customer', 'staff']
const LABEL_COLORS: readonly LabelColor[] = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
]

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function flag(value: unknown): boolean {
  return value === true
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    return record ? [record] : []
  })
}

/** An ISO timestamp. A Date the API serialised is already one; anything else is not a time. */
function timestamp(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  return Number.isNaN(Date.parse(raw)) ? null : raw
}

function person(value: unknown): ConversationPerson | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const name = text(record.name)
  if (!id || !name) return null

  return {
    id,
    name,
    ...(typeof record.isOnline === 'boolean' ? { isOnline: record.isOnline } : {}),
    ...('lastOnlineAt' in record ? { lastOnlineAt: timestamp(record.lastOnlineAt) } : {}),
  }
}

function staffPerson(value: unknown): ConversationStaffPerson | null {
  const base = person(value)
  const record = asRecord(value)
  if (!base || !record) return null
  const role = oneOf(record.role, ROLES)
  if (!role) return null
  return { ...base, role }
}

function staffPeople(value: unknown): ConversationStaffPerson[] {
  return records(value).flatMap((item) => {
    const member = staffPerson(item)
    return member ? [member] : []
  })
}

function label(value: unknown): Label | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const name = text(record.name)
  if (!id || !name) return null
  return {
    id,
    name,
    color: oneOf(record.color, LABEL_COLORS) ?? 'slate',
    archived: flag(record.archived),
  }
}

function labels(value: unknown): Label[] {
  return records(value).flatMap((item) => {
    const parsed = label(item)
    return parsed ? [parsed] : []
  })
}

type LastMessageFields = {
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageMine: boolean
  lastMessageReceiptStatus: ReceiptStatus | null
  lastMessageRead: boolean
  unreadCount: number | null
}

function lastMessageFields(record: Record<string, unknown>): LastMessageFields {
  return {
    lastMessageAt: timestamp(record.lastMessageAt),
    lastMessagePreview: nullableText(record.lastMessagePreview),
    lastMessageMine: flag(record.lastMessageMine),
    lastMessageReceiptStatus: oneOf(record.lastMessageReceiptStatus, RECEIPT_STATUSES),
    /**
     * Read by default: an unread row is a claim on someone's attention, and a
     * payload that failed to say either way is not grounds for making one.
     */
    lastMessageRead: record.lastMessageRead !== false,
    unreadCount: count(record.unreadCount),
  }
}

/**
 * One conversation row, in whichever of the two shapes it arrived.
 *
 * The labels array decides: only the staff payload carries it, and it carries it
 * on every conversation type. See `isStaffConversation`.
 */
export function parseConversation(value: unknown): Conversation | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const organizationId = text(record.organizationId)
  const type = oneOf(record.type, CONVERSATION_TYPES)
  if (!id || !type) return null

  const shared = {
    id,
    communityId: nullableText(record.communityId),
    ...lastMessageFields(record),
    // Every shape carries it. Missing or unreadable reads as unknown rather than
    // dropping the row: the row still draws, and its composer says it is updating.
    access: parseAccess(record.access),
  }

  /*
   * Answered before the organization is required, because this is the one type
   * that may arrive without one: the personal Announcements thread belongs to a
   * person rather than to an organization. Requiring it here was what dropped
   * the row, and dropping the row was what left a Broadcast notification
   * pointing at a thread the app did not hold.
   *
   * First, too, rather than after the staff branch below: a broadcast thread
   * carries no labels for that branch to recognise it by, whoever is reading.
   */
  if (type === 'broadcast_inbox') {
    return {
      ...shared,
      organizationId: organizationId ?? null,
      type,
      title: text(record.title) ?? 'Announcements',
    }
  }

  /*
   * A Support DM without one is the onboarding thread: the Customer belongs to no
   * organization yet, so there is none to stamp. Admitted for the same reason the
   * Announcements thread above is -- requiring an organization here would drop the row, and a
   * dropped row is a thread the app does not hold and a notification pointing at nothing.
   *
   * Every other type still requires one, and a row arriving without it is malformed rather
   * than a shape this list has to draw.
   */
  if (!organizationId && type !== 'support_dm') return null

  const base = { ...shared, organizationId: organizationId ?? null }

  if (Array.isArray(record.labels)) {
    return {
      ...base,
      type,
      status: oneOf(record.status, SUPPORT_STATUSES),
      title: nullableText(record.title),
      description: nullableText(record.description),
      avatarUrl: nullableText(record.avatarUrl),
      customer: person(record.customer),
      assignedAgent: person(record.assignedAgent),
      otherUser: staffPerson(record.otherUser),
      members: staffPeople(record.members),
      labels: labels(record.labels),
      writePolicy: oneOf(record.writePolicy, WRITE_POLICIES),
      // Deprecated in the API's schema and kept only while installed builds read
      // it. The composer reads `access` instead; see `lib/conversation-access`.
      canWrite: record.canWrite !== false,
    }
  }

  if (type === 'group') {
    return {
      ...base,
      type,
      title: text(record.title) ?? 'Group',
      description: nullableText(record.description),
      avatarUrl: nullableText(record.avatarUrl),
      members: staffPeople(record.members),
      writePolicy: oneOf(record.writePolicy, WRITE_POLICIES) ?? 'everyone',
      canWrite: record.canWrite !== false,
    }
  }

  // A Customer never receives a staff DM, so anything left is their support thread.
  return { ...base, type: 'support_dm' }
}

export function parseConversations(value: unknown): Conversation[] {
  return records(value).flatMap((item) => {
    const conversation = parseConversation(item)
    return conversation ? [conversation] : []
  })
}

/**
 * One attachment, from a message payload or from the upload endpoint's answer.
 *
 * The two shapes differ only in what they leave out: `POST /:id/files` reports
 * the type, URL, name and size of the object it stored and nothing about
 * duration or waveform, because it received a file rather than a voice note.
 * Both read as null here, and `storedAttachment` is what fills them back in
 * from what the recorder measured.
 */
export function parseAttachment(value: unknown): MessageAttachment | null {
  const record = asRecord(value)
  if (!record) return null
  const url = text(record.url)
  if (!url) return null

  const waveform = Array.isArray(record.waveform)
    ? record.waveform.filter((point): point is number => typeof point === 'number')
    : null

  return {
    type: text(record.type) ?? '',
    url,
    fileName: nullableText(record.fileName),
    size: count(record.size),
    durationSeconds: count(record.durationSeconds),
    waveform,
  }
}

function reaction(value: unknown): MessageReaction | null {
  const record = asRecord(value)
  if (!record) return null
  const emoji = text(record.emoji)
  const userId = text(record.userId)
  return emoji && userId ? { emoji, userId } : null
}

function replyTo(value: unknown): MessageReplyTo | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  return id ? { id, preview: nullableText(record.preview) } : null
}

/**
 * One message, in whichever of the two shapes it arrived.
 *
 * An unrecognised messageType reads as text, the only fallback that still shows
 * the person what was written. It is not how the system-message rule is
 * enforced: the API withholds those before they are sent, and
 * `lib/thread-state` filters on the type it did recognise.
 */
export function parseMessage(value: unknown): Message | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const createdAt = timestamp(record.createdAt)
  if (!id || !createdAt) return null

  const base = {
    id,
    body: nullableText(record.body) ?? '',
    messageType: oneOf(record.messageType, MESSAGE_TYPES) ?? ('text' as const),
    // Set only when true, rather than always written as a boolean: absent is what "internal"
    // already means here, and it is what an older API sends. Writing `false` onto every
    // message would also change the shape of every parsed message, which the store compares
    // by value when it restores a draft.
    ...(record.addressedToCustomer === true ? { addressedToCustomer: true } : {}),
    createdAt,
    // Absent on a message written before the field existed, and on every message
    // nobody has rewritten — both read as null, which is the same thing here.
    editedAt: timestamp(record.editedAt) ?? null,
    replyTo: replyTo(record.replyTo),
    reactions: records(record.reactions).flatMap((item) => {
      const parsed = reaction(item)
      return parsed ? [parsed] : []
    }),
    attachments: records(record.attachments).flatMap((item) => {
      const parsed = parseAttachment(item)
      return parsed ? [parsed] : []
    }),
    receiptStatus: oneOf(record.receiptStatus, RECEIPT_STATUSES) ?? ('sent' as const),
  }

  const sender = staffPerson(record.sender)
  if (sender) return { ...base, sender }

  return { ...base, fromCompany: flag(record.fromCompany) }
}

/**
 * One receipt. The person is optional by design — see `MessageReceipt` — but the
 * timestamp is not: a receipt with no time is the one thing this screen exists to
 * show, so a row missing it is dropped rather than drawn blank.
 */
function messageReceipt(value: unknown): MessageReceipt | null {
  const record = asRecord(value)
  if (!record) return null
  const at = timestamp(record.at)
  if (!at) return null
  return { user: staffPerson(record.user), at }
}

export function parseMessageReceipts(value: unknown): MessageReceipts | null {
  const record = asRecord(value)
  if (!record) return null

  const read = (raw: unknown) =>
    records(raw).flatMap((item) => {
      const parsed = messageReceipt(item)
      return parsed ? [parsed] : []
    })

  return { readBy: read(record.readBy), deliveredTo: read(record.deliveredTo) }
}

export function parseMessages(value: unknown): Message[] {
  return records(value).flatMap((item) => {
    const message = parseMessage(item)
    return message ? [message] : []
  })
}

/** The two roles the staff directory answers with. A Customer is never in it. */
const STAFF_ROLES: readonly StaffDirectoryUser['role'][] = ['admin', 'agent']

function organizations(value: unknown): Organization[] {
  return records(value).flatMap((item) => {
    const id = text(item.id)
    const name = text(item.name)
    return id && name ? [{ id, name }] : []
  })
}

/**
 * One row of the staff directory.
 *
 * `sharedOrganizations` is optional on the API's schema — the directory fills it
 * on every row, but the same person shape is reused by payloads that do not — so
 * an absent field reads as null, "the API did not say", and never as an empty
 * list, which is what a staff member sharing no organization with the viewer
 * looks like. A screen that disables a row on the second must not disable it on
 * the first.
 */
export function parseStaffDirectoryUser(value: unknown): StaffDirectoryUser | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const name = text(record.name)
  const role = oneOf(record.role, STAFF_ROLES)
  if (!id || !name || !role) return null

  return {
    id,
    name,
    role,
    ...(typeof record.isOnline === 'boolean' ? { isOnline: record.isOnline } : {}),
    ...('lastOnlineAt' in record ? { lastOnlineAt: timestamp(record.lastOnlineAt) } : {}),
    sharedOrganizations: Array.isArray(record.sharedOrganizations)
      ? organizations(record.sharedOrganizations)
      : null,
  }
}

export function parseStaffDirectory(value: unknown): StaffDirectoryUser[] {
  return records(value).flatMap((item) => {
    const user = parseStaffDirectoryUser(item)
    return user ? [user] : []
  })
}

/** GET /memberships/mine answers with rows rather than a bare array. */
export function parseOrganizations(value: unknown): Organization[] {
  return organizations(asRecord(value)?.rows)
}

/** Every label the signed-in staff member may put on a conversation. */
export function parseLabels(value: unknown): Label[] {
  return labels(value)
}

/** One label, as the create and update routes answer with it. */
export function parseLabel(value: unknown): Label | null {
  return label(value)
}

/**
 * One internal note.
 *
 * The author is required, unlike most of what is optional here: a note with
 * nobody's name on it is not a note anyone can weigh, and dropping the row is
 * more honest than attributing it to nobody.
 */
export function parseNote(value: unknown): ConversationNote | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const body = text(record.text)
  const author = asRecord(record.author)
  const authorId = author ? text(author.id) : null
  const authorName = author ? text(author.name) : null
  const createdAt = timestamp(record.createdAt)
  if (!id || !body || !authorId || !authorName || !createdAt) return null

  return {
    id,
    text: body,
    author: { id: authorId, name: authorName },
    messageId: nullableText(record.messageId),
    createdAt,
  }
}

/** A page of notes, newest last as the API sends them. Unreadable rows drop. */
export function parseNotes(value: unknown): ConversationNote[] {
  return records(value).flatMap((item) => {
    const parsed = parseNote(item)
    return parsed ? [parsed] : []
  })
}

/**
 * One row of the contact directory.
 *
 * The kind is required and the role is not: a company row is an organization
 * rather than somebody, and the API sends null for it. A row whose kind this
 * client does not recognise is dropped rather than guessed at — every branch
 * downstream of here is a decision about what a tap does, and a kind nobody
 * can read has no answer to that.
 */
export function parseContact(value: unknown): Contact | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const name = text(record.name)
  const kind = oneOf(record.kind, CONTACT_KINDS)
  if (!id || !name || !kind) return null

  return {
    id,
    name,
    kind,
    role: oneOf(record.role, ROLES),
    conversationId: nullableText(record.conversationId),
  }
}

export function parseContacts(value: unknown): Contact[] {
  return records(value).flatMap((item) => {
    const contact = parseContact(item)
    return contact ? [contact] : []
  })
}
