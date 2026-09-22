import { isStaffConversation } from '@/lib/types'
import type { Conversation, Label, LabelColor, UserRole } from '@/lib/types'

/**
 * What a conversation says about itself, beside the messages in it.
 *
 * Pure, and separate from the screen, because most of it is a table of rules
 * about who may see what: assignment is internal and absent from a Customer's
 * payload, notes exist on one conversation type and for staff only, and a label
 * already on a thread is not one to offer again. Each of those is a sentence
 * worth writing once and testing, rather than a condition buried in JSX.
 *
 * Mirrors the web client's Conversation Details pane, which is the same set of
 * rules read off the same payload.
 */

const TYPE_LABEL: Record<Conversation['type'], string> = {
  support_dm: 'Support DM',
  // "Staff 1:1", the web client's wording, because the glossary's Staff DM is
  // the *concept* and this line is describing one conversation's shape.
  staff_dm: 'Staff 1:1',
  group: 'Group',
  broadcast_inbox: 'Announcements',
}

/**
 * The thread's assignment state, in the words the pill above it already uses.
 *
 * The API's enum is `engaged`, and the web client prints it. This client's
 * thread header has printed *Assigned* since the pill existed, and the two
 * screens are one tap apart — a state that renames itself on the way between
 * them reads as two states. CONTEXT.md's Engage entry is the tiebreak: Engage is
 * the action, and assignment is what results, so the state is named for the
 * result. Closed reads as Resolved for the same reason, in both places.
 *
 * See `statusPill` in `components/chat/thread-header.tsx`.
 */
const STATUS_LABEL = {
  unassigned: 'Unassigned',
  engaged: 'Assigned',
  closed: 'Resolved',
} as const

export function conversationTypeLabel(conversation: Conversation): string {
  return TYPE_LABEL[conversation.type]
}

/** One line of the Conversation Info block. */
export type DetailField = { label: string; value: string }

/**
 * Type, status and assignee, for whoever is reading.
 *
 * A Customer gets the type and nothing else. Assignment is internal — their
 * payload does not carry it, which is the point rather than an omission to work
 * around, and the company is meant to reach them as one voice rather than as
 * whoever is currently holding the thread.
 *
 * A group has no assignment either, whoever is looking: `status` is null on
 * every conversation type but a Support DM, and a row reading "-" for it would
 * be inventing a field the thread does not have.
 */
export function conversationDetailFields(conversation: Conversation): DetailField[] {
  const fields: DetailField[] = [
    { label: 'Type', value: conversationTypeLabel(conversation) },
  ]

  if (!isStaffConversation(conversation)) return fields

  if (conversation.type === 'group') {
    fields.push({
      label: 'Members',
      value: `${conversation.members.length}`,
    })
    return fields
  }

  if (conversation.status !== null) {
    fields.push({ label: 'Status', value: STATUS_LABEL[conversation.status] })
  }
  if (conversation.type === 'support_dm') {
    fields.push({
      label: 'Assigned agent',
      value: conversation.assignedAgent?.name ?? 'Unassigned',
    })
  }

  return fields
}

/**
 * The role of the person on the other side, where there is one person and a
 * staff payload naming them.
 *
 * A Support DM's other side is the Customer, whatever the payload says about
 * them; a Staff DM's other side carries its own role, because it may be either.
 * Null for a group, which has no single other side, and null for a Customer's
 * payload, which names nobody — the company reaches them as one voice.
 */
export function conversationPeerRole(conversation: Conversation): UserRole | null {
  if (!isStaffConversation(conversation)) return null
  if (conversation.type === 'support_dm') return conversation.customer ? 'customer' : null
  if (conversation.type === 'staff_dm') return conversation.otherUser?.role ?? null
  return null
}

/** The labels on a conversation, or none at all where labels do not apply. */
export function appliedLabels(conversation: Conversation): Label[] {
  return isStaffConversation(conversation) ? conversation.labels : []
}

/**
 * The labels worth offering: every live one this thread is not already wearing.
 *
 * An archived label is one an Admin has retired. It stays on the threads that
 * already carry it — removing it from those would rewrite history — and is
 * offered on none.
 */
export function offerableLabels(all: Label[], conversation: Conversation): Label[] {
  const applied = new Set(appliedLabels(conversation).map((label) => label.id))
  return all.filter((label) => !label.archived && !applied.has(label.id))
}

/** Whether this person may put labels on this thread at all. */
export function canLabel(conversation: Conversation, role: UserRole): boolean {
  return role !== 'customer' && isStaffConversation(conversation)
}

/**
 * Whether this thread has internal notes to read.
 *
 * Staff only, and Support DMs only: the API answers `404` for a note request on
 * any other conversation type, and asking anyway would turn a rule into an error
 * message.
 */
export function canReadNotes(conversation: Conversation, role: UserRole): boolean {
  return (
    role !== 'customer' &&
    isStaffConversation(conversation) &&
    conversation.type === 'support_dm'
  )
}

/**
 * A label chip's colours.
 *
 * Nine hues sit outside this app's sunset arc for the reason the web client
 * records: an analogous scheme cannot encode categories, and a label is a
 * category an Admin chose and expects to keep telling apart. What the arc
 * governs is the shape — a borderless wash carrying its own ink.
 *
 * Hexes rather than class names, and applied as a style: this app's theme
 * defines a dozen tokens and none of these hues, so `bg-violet-500/12` would
 * name a colour nothing in the build resolves. The wash is the 500 at 12% and
 * the ink is the 800, which is where the web client's chip gets its contrast.
 */
const LABEL_HEX: Record<LabelColor, { wash: string; ink: string }> = {
  slate: { wash: '#64748b1f', ink: '#1e293b' },
  red: { wash: '#ef44441f', ink: '#991b1b' },
  orange: { wash: '#f973161f', ink: '#9a3412' },
  amber: { wash: '#f59e0b1f', ink: '#92400e' },
  green: { wash: '#22c55e1f', ink: '#166534' },
  teal: { wash: '#14b8a61f', ink: '#115e59' },
  blue: { wash: '#3b82f61f', ink: '#1e40af' },
  violet: { wash: '#8b5cf61f', ink: '#5b21b6' },
  pink: { wash: '#ec48991f', ink: '#9d174d' },
}

export function labelChipColors(color: LabelColor): { wash: string; ink: string } {
  return LABEL_HEX[color]
}

/** Every colour a label may wear, in the order the picker offers them. */
export const LABEL_COLOR_CHOICES: readonly LabelColor[] = [
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

/**
 * The label vocabulary, in the order an Admin reads it: live labels first,
 * alphabetically, then the retired ones after them.
 *
 * Archived labels are not hidden. They stay on the threads already wearing
 * them, so an Admin wondering why a chip they cannot offer is still appearing
 * has to be able to find the label and see that it is retired — and bring it
 * back, which is the same switch the other way.
 */
export function orderedLabels(labels: Label[]): Label[] {
  return [...labels].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}
