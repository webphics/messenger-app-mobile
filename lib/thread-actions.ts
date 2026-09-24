import { isStaffConversation } from '@/lib/types'
import type { Conversation, StaffDirectoryUser, UserRole } from '@/lib/types'

/**
 * What a staff member may do *to* a thread, as opposed to in it.
 *
 * Writing in a thread is `lib/composer-access`; this is the pair of actions
 * that end or redirect the work — Close and Transfer — plus the question of
 * who a transfer may go to. They are kept apart because they answer different
 * questions off the same payload: an Admin looking at somebody else's engaged
 * thread may take it over and write in it, and may still not close it.
 *
 * Mirrors the API's `conversations.policy.ts`, which is the authority.
 * `assertCanTransfer` and `assertCanClose` both begin by demanding the actor
 * *be the assignee* of an engaged Support DM, and both then check a capability
 * an Admin bypasses. So the assignee test is the one this can mirror honestly
 * and the capability test is not: an Agent's grants are not on the session
 * payload, and there is nothing here that could read them. An Agent whose
 * `transfer` capability has been revoked is therefore offered a control the
 * API refuses — which is the one gap, it is narrow, and the refusal arrives
 * as the API's own sentence rather than as silence.
 *
 * The alternative was to offer neither action to any Agent, which would take
 * both away from every Agent who does have them, for the sake of the few who
 * do not.
 */

/** Who is looking, which is all either rule needs beyond the thread. */
export type ThreadViewer = { id: string; role: UserRole }

/**
 * Whether this person may close or transfer this thread.
 *
 * One predicate for both, because the API asks the same three questions of
 * each: a Support DM, engaged, and held by the person asking. Closing a
 * thread nobody has engaged is not a thing — an unassigned thread is engaged
 * first — and neither is transferring one.
 */
export function canManageAssignment(
  conversation: Conversation,
  viewer: ThreadViewer,
): boolean {
  if (viewer.role === 'customer') return false
  if (!isStaffConversation(conversation)) return false
  return (
    conversation.type === 'support_dm' &&
    conversation.status === 'engaged' &&
    conversation.assignedAgent?.id === viewer.id
  )
}

/** Which of the two this person is offered on this thread. */
export type ThreadActions = { close: boolean; transfer: boolean }

const NEITHER: ThreadActions = { close: false, transfer: false }

/**
 * Close and Transfer, for whichever way Support DMs are being worked.
 *
 * With assignment on, both are `canManageAssignment` and nothing else. In a
 * Shared queue there is no assignee to ask about: Transfer does not exist,
 * since there is nothing to hand on, and the API lets an Admin, or an Agent
 * holding the `close` capability, close any Support DM that is not closed
 * already. The capability is the half this cannot read, for the reason the
 * module doc gives, so Close is offered to every staff member on one and an
 * Agent without it is refused by the API in its own words.
 */
export function threadActions(
  conversation: Conversation,
  viewer: ThreadViewer,
  supportAssignment: boolean,
): ThreadActions {
  if (supportAssignment) {
    const manages = canManageAssignment(conversation, viewer)
    return { close: manages, transfer: manages }
  }

  if (viewer.role === 'customer') return NEITHER
  if (!isStaffConversation(conversation) || conversation.type !== 'support_dm') return NEITHER
  const open = conversation.status === 'unassigned' || conversation.status === 'engaged'
  return { close: open, transfer: false }
}

/**
 * Who a transfer may go to.
 *
 * Agents only. `assertCanTransfer` refuses a target whose role is not `agent`,
 * so an Admin in the staff directory is not a candidate however senior — a
 * Support DM is worked by an Agent, and an Admin who wants one takes it over
 * rather than being handed it. Whoever holds it now is excluded for the same
 * reason the API excludes them: transferring a thread to its own assignee is
 * a request with nothing in it.
 */
export function transferCandidates(
  directory: StaffDirectoryUser[],
  conversation: Conversation,
): StaffDirectoryUser[] {
  const holder = isStaffConversation(conversation)
    ? conversation.assignedAgent?.id
    : undefined
  return directory.filter((person) => person.role === 'agent' && person.id !== holder)
}

/**
 * Whether this person may change the organization's label vocabulary —
 * defining one, renaming one, retiring one.
 *
 * Admin only, unlike putting a label *on* a thread, which any staff member
 * may do. Both label routes are `@Roles(['admin'])`, so an Agent asking is
 * answered `403` whatever they send, and this is the one capability rule the
 * session payload can answer honestly: the role is on it.
 */
export function canManageLabels(role: UserRole | null): boolean {
  return role === 'admin'
}
