import { asRecord } from '@/lib/api-envelope'
import type { InvitationCardState, MessageComplaint, MessageInvitation } from '@/lib/types'

/**
 * The two General Support message shapes (`CONTEXT.md`): an Invitation card, and a Complaint.
 * Pure, so what a payload means and what a reader is told are table-tested rather than read off a
 * screen.
 */

const CARD_STATES: readonly InvitationCardState[] = ['pending', 'joined', 'declined', 'withdrawn']

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function organization(value: unknown): { id: string; name: string } | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  if (!id) return null
  return { id, name: text(record.name) ?? 'An organization' }
}

/**
 * The `invitation` on a message, or null for none. Null for a card it cannot answer -- no
 * invitation id or no organization -- rather than a card with a button that refuses. A state this
 * build does not know reads as `withdrawn`, which offers nothing to press.
 */
export function parseMessageInvitation(value: unknown): MessageInvitation | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const org = organization(record.organization)
  if (!id || !org) return null

  const state = (CARD_STATES as readonly string[]).includes(record.state as string)
    ? (record.state as InvitationCardState)
    : 'withdrawn'

  return {
    id,
    organization: org,
    state,
    supportConversationId: text(record.supportConversationId),
    answeredAt: text(record.answeredAt),
  }
}

/** The `complaint` on a message, or null for none. A missing organization means the app itself. */
export function parseMessageComplaint(value: unknown): MessageComplaint | null {
  const record = asRecord(value)
  if (!record) return null
  return { organization: organization(record.organization) }
}

/**
 * The line drawn over an admin-only message, for the readers who are sent one: its Customer and
 * Admins. A Complaint says what it is about; a reply to one says only that it is private.
 */
export function adminOnlyLabel(message: {
  adminOnly?: boolean
  complaint?: MessageComplaint
}): string | null {
  if (!message.adminOnly) return null
  if (message.complaint) {
    const about = message.complaint.organization?.name
    return `${about ? `Complaint about ${about}` : 'Complaint'} · only visible to admins`
  }
  return 'Only visible to admins'
}

/** One thing that happened to an Invitation card, with when. `kind` decides its colour. */
export type InvitationCardEvent = {
  kind: 'invited' | Exclude<InvitationCardState, 'pending'>
  label: string
  at: string
}

const ANSWER_LABEL: Record<Exclude<InvitationCardState, 'pending'>, string> = {
  joined: 'Joined',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

/**
 * What a card keeps on record, oldest first: when the invitation was sent, and when it was
 * answered or withdrawn. The card is the record of the invitation in General Support, so both stay
 * on it for good. An answer the API sent no time for is left out rather than drawn without one.
 */
export function invitationCardEvents(
  sentAt: string,
  invitation: Pick<MessageInvitation, 'state' | 'answeredAt'>,
): InvitationCardEvent[] {
  const sent: InvitationCardEvent = { kind: 'invited', label: 'Invited', at: sentAt }
  if (invitation.state === 'pending' || !invitation.answeredAt) return [sent]
  return [
    sent,
    { kind: invitation.state, label: ANSWER_LABEL[invitation.state], at: invitation.answeredAt },
  ]
}

/** A card event's time in the reader's locale: "10 Oct · 1:52 AM". */
export function invitationEventTime(at: string): string {
  const date = new Date(at)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** The one line under a card's name: what it is asking, or what came of it. */
export function invitationCardLine(
  state: InvitationCardState,
  isInvited: boolean,
  name: string,
): string {
  switch (state) {
    case 'pending':
      return isInvited
        ? `Join to open a support conversation with ${name}.`
        : 'Waiting for the customer to answer.'
    case 'joined':
      return isInvited ? `You joined ${name}.` : `The customer joined ${name}.`
    case 'declined':
      return isInvited ? 'You declined this invitation.' : 'The customer declined.'
    case 'withdrawn':
      return 'This invitation was withdrawn.'
  }
}
