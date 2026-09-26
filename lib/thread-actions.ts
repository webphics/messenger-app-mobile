import { isStaffConversation } from '@/lib/types'
import type { Conversation, StaffDirectoryUser } from '@/lib/types'

/*
 * Whether a viewer is offered Transfer, Close, Reopen, Engage or Take over is
 * no longer decided here. The API sends it on the conversation's `access`,
 * with the Capabilities this client cannot see already applied, and
 * `lib/conversation-access` reads it (`threadActionsView`). What stays is who
 * a transfer may go to, which `access` does not answer.
 */

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
