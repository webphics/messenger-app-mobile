import { isStaffConversation } from '@/lib/types'
import type { ComposerAction } from '@/lib/composer-access'
import type { Conversation, StaffConversation } from '@/lib/types'

/**
 * Whether the thread is still in a state this action makes sense on.
 *
 * Engage and Takeover are the two actions in this app that race. The Unassigned
 * pool is one queue several staff are watching, and the row a phone holds is
 * old between any two fetches — older still once the Store has restored one from
 * disk and the phone has been in a pocket since. So both actions re-read the
 * conversation before they fire, and this is what reads the answer:
 * `lib/use-conversation-assignment` asks it whether to carry on, and shows what
 * it says instead when the answer is no.
 *
 * It judges the thread's *state*, never the person. Who may take a thread over
 * is the API's rule — `assertCanTakeOver` begins with `assertAdmin`, and an
 * Agent is refused `403` whatever the state — and it is mirrored once, in
 * `lib/composer-access`, which is what decides whether a button is offered at
 * all. Repeating it here would mean two places to keep in step and would turn a
 * permission refusal into a sentence about somebody else holding the thread,
 * which would be a lie. What this adds is the one thing the held row cannot
 * know: what the API said a moment ago.
 *
 * It reads the same statuses `composer-access` reads, and deliberately so.
 * That file answers what to *offer* somebody looking at a thread; this one
 * answers whether an offer already taken up is still good. They agree today
 * because the API's states are the same states, and the duplication is two
 * short cascades rather than one shared one because collapsing them would mean
 * a verdict on the person — see above.
 *
 * A row that cannot answer — no status, or a Customer's payload, which carries
 * no assignment at all — fires. Nothing the API documents produces either on a
 * thread offering one of these buttons, and inventing a refusal for a shape we
 * do not understand would block an action the API might well have accepted.
 */

export type AssignmentPrecheck =
  | { kind: 'fire' }
  /** Why it did not fire, in words for the person who tapped. */
  | { kind: 'stop'; message: string }

const FIRE: AssignmentPrecheck = { kind: 'fire' }

function stop(message: string): AssignmentPrecheck {
  return { kind: 'stop', message }
}

/**
 * `viewer.id` is nullable because a hook cannot promise a signed-in person the
 * way a screen can. An id of null matches no assignee, which is the right answer
 * in every branch below: nothing is ever "already yours" when there is no you.
 */
export function assignmentPrecheck(
  kind: ComposerAction['kind'],
  conversation: Conversation,
  viewer: { id: string | null },
): AssignmentPrecheck {
  if (!isStaffConversation(conversation)) return FIRE

  const { status } = conversation
  if (status === null) return FIRE

  /*
   * Each sentence says what changed, rather than repeating the reason line it
   * lands under. That line is `composerAccess`'s, recomputed from the row this
   * re-read just folded in, so it already says what the thread is now — a
   * closed one says it is closed, and one somebody holds names them. What it
   * cannot say is that this happened between opening the thread and tapping.
   */
  if (status === 'closed') return stop('It was closed while you were reading it.')

  /*
   * The status is read before the assignee, in both branches, because an
   * unassigned thread is claimable whoever it names. `composerAccess` offers
   * the Engage on one of those without looking at `assignedAgent` at all, and
   * these two must not disagree about the same row — a button that is offered
   * and then refused by its own client is the thing this module exists to
   * prevent.
   */
  if (kind === 'engage') {
    if (status === 'unassigned') return FIRE
    if (isMine(conversation, viewer)) return MINE
    const holder = conversation.assignedAgent?.name
    return stop(
      holder
        ? `${holder} engaged this conversation first.`
        : 'Another agent engaged this conversation first.',
    )
  }

  // A Takeover wants somebody to take it from, and somebody other than you.
  if (status !== 'engaged') return stop('This conversation is no longer assigned to anybody.')
  return isMine(conversation, viewer) ? MINE : FIRE
}

/**
 * The thread is already theirs, so the composer is about to open on it. The same
 * sentence for both actions, because the outcome is the same one and neither the
 * `409` nor the `403` the API would answer is news worth passing on.
 */
const MINE = stop('You are already handling this conversation.')

function isMine(conversation: StaffConversation, viewer: { id: string | null }): boolean {
  return viewer.id !== null && conversation.assignedAgent?.id === viewer.id
}
