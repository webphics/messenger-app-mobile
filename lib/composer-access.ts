import { isStaffConversation } from '@/lib/types'
import type { Conversation, UserRole } from '@/lib/types'

/**
 * Whether this person may write in this thread, and what to say when they may not.
 *
 * Reading a thread and writing in it are different permissions on the staff
 * side, and the gap between them is wide: an Agent sees every Support DM in
 * their organizations — that is what makes the unassigned pool and Takeover
 * possible at all — but exactly one person writes in each of them, the one who
 * engaged it. Everyone else is read-only until they engage or it is transferred.
 *
 * This mirrors the API's `conversations.policy.ts`, which is the authority and
 * refuses with `must_engage`, `must_take_over` or `already_engaged`. It is
 * mirrored rather than left to the round trip because the alternative is a
 * composer that invites a message, accepts it, marks it as sending and then
 * fails it — the person has already written the thing by the time the app admits
 * it was never going to be sent.
 *
 * A read-only thread sometimes comes with a way out of it, and this is what
 * says so: an unassigned Support DM can be engaged by any staff member, and one
 * somebody else holds can be taken over by an Admin. The rule that decides which
 * is the API's, mirrored for the same reason as the rest of this file — the API
 * answers an Agent's Takeover `403` whatever the thread's state, because
 * `assertCanTakeOver` begins with `assertAdmin`, so an Agent is told who is
 * handling the thread and offered nothing. A button that always fails is worse
 * than no button.
 */

/** What a staff member may do about a thread they cannot write in yet. */
export type ComposerAction = {
  kind: 'engage' | 'takeover'
  /** The words on the button. The web client's, so the two products agree. */
  label: string
}

export type ComposerAccess =
  | { kind: 'open' }
  | { kind: 'read-only'; reason: string; action?: ComposerAction }

const OPEN: ComposerAccess = { kind: 'open' }

const ENGAGE: ComposerAction = { kind: 'engage', label: 'Engage chat' }
const TAKE_OVER: ComposerAction = { kind: 'takeover', label: 'Take over' }

function readOnly(reason: string, action?: ComposerAction): ComposerAccess {
  return action ? { kind: 'read-only', reason, action } : { kind: 'read-only', reason }
}

export type ComposerViewer = { id: string; role: UserRole }

export function composerAccess(
  conversation: Conversation,
  viewer: ComposerViewer,
): ComposerAccess {
  /*
   * A Customer's own payload. It carries no status and no assignee — those are
   * staff-facing — and the two rules that reach a Customer are simple: they may
   * always write in their own support thread, closed or not, and an
   * announcement is something they receive rather than post in.
   */
  if (!isStaffConversation(conversation)) {
    return conversation.type === 'community_announcement'
      ? readOnly('Announcements are posted by the team.')
      : OPEN
  }

  if (conversation.type === 'community_announcement') {
    // An Agent posts only in the announcements they were added to; an Admin in any.
    if (viewer.role === 'admin') return OPEN
    return conversation.members.some((member) => member.id === viewer.id)
      ? OPEN
      : readOnly('Announcements are posted by the team.')
  }

  // A staff DM and a group are writable by anyone the API sent them to.
  if (conversation.type !== 'support_dm') return OPEN

  if (conversation.status === 'closed') {
    return readOnly('This conversation is closed.')
  }

  if (conversation.status === 'unassigned') {
    // Every staff role may engage: the API asks only that the actor is staff and
    // that the thread is in one of their organizations, which is the same test
    // that put it in this list.
    return readOnly('Engage this conversation to reply.', ENGAGE)
  }

  if (conversation.status === 'engaged') {
    if (conversation.assignedAgent?.id === viewer.id) return OPEN
    if (viewer.role === 'admin') {
      return readOnly('Take over this conversation to reply.', TAKE_OVER)
    }
    const holder = conversation.assignedAgent?.name
    return readOnly(
      holder ? `${holder} is handling this conversation.` : 'Another agent is handling this conversation.',
    )
  }

  /*
   * No status at all. Nothing the API documents produces this, so the choice is
   * between refusing a send it might have accepted and offering one it might
   * refuse — and the second leaves the person's words on screen with a retry,
   * while the first leaves them with no way to write at all.
   */
  return OPEN
}
