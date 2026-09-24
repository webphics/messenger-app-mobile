import { isStaffConversation } from '@/lib/types'
import type { Conversation, GroupWritePolicy, UserRole } from '@/lib/types'

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
 *
 * All of that is assignment, and assignment can be switched off. In a Shared
 * queue nobody holds a Support DM, so every staff member who can read one may
 * write in it until it is closed, and there is nothing to engage or take over.
 * `supportAssignment` says which of the two this is — see
 * `lib/support-assignment`.
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

/**
 * A Group's own wording for the write policy locking its composer, mirroring
 * the web client's copy so the two products agree (messenger-app#58's
 * `composerLockedNamed` / `composerLockedAdmins`). `everyone` never reaches
 * this: the API's `canWrite` is already resolved against the policy, so a
 * `false` under `everyone` cannot happen from a payload this client should
 * trust, and the `admins` wording is the safer of the two if it somehow does.
 */
function groupPolicyReason(writePolicy: GroupWritePolicy | null | undefined): string {
  return writePolicy === 'named'
    ? 'Only the members chosen for this group can send messages here.'
    : "Only this group's admins can send messages here."
}

/**
 * A Group's read model, ahead of everything else this file decides for one:
 * `canWrite` arrives already resolved against the write policy — an Admin, a
 * participating Agent and a Community Moderator all bypass it (#46) — so this
 * never derives who may send from role or membership on the device. `null`
 * when the Group writes freely, leaving the caller to fall through to `OPEN`.
 */
function groupWriteAccess(conversation: {
  canWrite?: boolean
  writePolicy?: GroupWritePolicy | null
}): ComposerAccess | null {
  if (conversation.canWrite === false) {
    return readOnly(groupPolicyReason(conversation.writePolicy))
  }
  return null
}

export function composerAccess(
  conversation: Conversation,
  viewer: ComposerViewer,
  supportAssignment: boolean,
): ComposerAccess {
  /*
   * A Customer's own payload. It carries no status and no assignee — those are
   * staff-facing — and the two rules that reach a Customer are simple: they may
   * always write in their own support thread, closed or not, and an
   * announcement is something they receive rather than post in.
   */
  /*
   * An Announcements thread is read-only for everybody, whatever their role.
   *
   * The API refuses every reply to one — `broadcast_inbox_read_only`,
   * "Announcements cannot be replied to" — and refuses an Admin's management of
   * one with a 404, because ADR 0009 keeps the existence of a person's
   * announcements thread private even from them. A Community's announcements
   * are written through the Communities API rather than through this composer,
   * so there is no role here for which offering one would lead anywhere but a
   * refusal.
   *
   * Answered before the staff split below, since the answer does not depend on
   * it — and since a broadcast payload has no `members` for a staff branch to
   * test a viewer against.
   */
  if (conversation.type === 'broadcast_inbox') {
    return readOnly('Announcements are posted by the team.')
  }

  if (!isStaffConversation(conversation)) {
    if (conversation.type === 'group') {
      return groupWriteAccess(conversation) ?? OPEN
    }
    return OPEN
  }

  if (conversation.type === 'group') {
    return groupWriteAccess(conversation) ?? OPEN
  }

  // A staff DM is writable by anyone the API sent them to.
  if (conversation.type !== 'support_dm') return OPEN

  if (conversation.status === 'closed') {
    return readOnly('This conversation is closed.')
  }

  // A Shared queue: nobody holds it, so whoever can read it answers it.
  if (!supportAssignment) return OPEN

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
