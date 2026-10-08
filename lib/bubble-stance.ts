import { isStaffMessage, type ConversationType, type Message, type UserRole } from '@/lib/types'

/**
 * Which side of the thread a bubble sits on, and what it is painted with.
 *
 * The web client's `messageStance`, ported so both clients put every message on
 * the same side and name the same people.
 */
export type BubbleStance = {
  side: 'start' | 'end'
  /**
   * `mine` is the primary fill, `colleague` the soft tint for a teammate who
   * speaks for the company, `incoming` the surface fill for the other side.
   */
  variant: 'mine' | 'colleague' | 'incoming'
  /** The viewer wrote it. Only the sender has receipts, Message info, Edit and Delete. */
  isMine: boolean
}

/**
 * The conversation kinds where the company speaks as one voice. A Customer holds
 * a Support DM with the company rather than with whichever staff member is
 * holding it, so every company-side message belongs on the same side whoever
 * typed it. A Staff DM and a Group are per person.
 */
const ONE_VOICE_CONVERSATIONS: ReadonlySet<ConversationType> = new Set(['support_dm'])

const MINE: BubbleStance = { side: 'end', variant: 'mine', isMine: true }
const COLLEAGUE: BubbleStance = { side: 'end', variant: 'colleague', isMine: false }
const INCOMING: BubbleStance = { side: 'start', variant: 'incoming', isMine: false }

/**
 * Where a message sits.
 *
 * A Support DM has two sides but three kinds of author: the Customer, the
 * viewer, and whichever colleague held it before them. Drawing a colleague's
 * message as incoming put it on the Customer's side, which reads as the
 * Customer having said it. It belongs on the company's side, and the tint is
 * what separates "the company, but not you" from "you".
 *
 * A Customer's own copy of a message carries no sender — only whether it came
 * from the company — so the colleague stance is unreachable from their payload
 * by construction.
 */
export function messageStance(
  message: Message,
  viewer: { id: string; role: UserRole },
  conversationType: ConversationType | undefined,
): BubbleStance {
  if (!isStaffMessage(message)) return message.fromCompany ? INCOMING : MINE

  if (message.sender.id === viewer.id) return MINE

  const speaksForCompany =
    viewer.role !== 'customer' &&
    message.sender.role !== 'customer' &&
    conversationType !== undefined &&
    ONE_VOICE_CONVERSATIONS.has(conversationType)

  return speaksForCompany ? COLLEAGUE : INCOMING
}

/**
 * Whether a run's first bubble names who wrote it.
 *
 * A Group names everyone but the viewer, because several people speak into one
 * thread. A one-voice conversation names only the colleague bubbles: the other
 * side is the person the header already names.
 */
export function namesItsSender(
  stance: BubbleStance,
  conversationType: ConversationType | undefined,
): boolean {
  if (stance.isMine) return false
  return stance.variant === 'colleague' || conversationType === 'group'
}
