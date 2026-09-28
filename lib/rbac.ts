import { can, type Capability } from '@/lib/capabilities'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, UserRole } from '@/lib/types'

const ROLES: readonly UserRole[] = ['admin', 'agent', 'customer']

function assertRole(role: UserRole): void {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown role: ${String(role)}`)
  }
}

/** Who is looking: the signed-in person, whom `SessionUser` already describes. */
export type ConversationViewer = {
  readonly id: string
  readonly role: UserRole
  readonly capabilities: readonly Capability[]
}

/**
 * Whether this viewer may open this conversation.
 *
 * The API decides this and has already decided it: `conversations.policy.ts`
 * scopes every list and every fetch by live organization membership, so a
 * conversation that reaches this client is one the server was willing to hand
 * over. What this guards is the route — `app/chat/[id].tsx` takes an id from a
 * URL, and a stale deep link or a role switched between renders should land
 * somewhere sensible rather than on a thread the person is not in.
 *
 * It mirrors the server's rules against the payload the client actually holds,
 * which is less than the server has:
 *
 * - An Announcements thread arrives in one shape for every role and names no
 *   members — it has one reader, and the API only ever sends it to them. There
 *   is nobody to check this viewer against, and the send is the check.
 * - A Customer's own payload carries no participant list for a Support DM, and
 *   nothing identifying whose thread it is. There is nothing to check, and
 *   pretending otherwise would be a check that reads as a decision while
 *   deciding nothing. What is checked is the shape: a Customer holding the staff
 *   payload is holding something that was never meant for them, and staff
 *   holding the Customer's is the same mistake the other way round.
 * - Staff see every Support DM in their organizations — assigned to anyone,
 *   unassigned, or closed (ADR 0005 on the API side). Assignment is not what
 *   gates visibility, which is why Takeover can exist at all.
 * - Groups carry their full membership, customers included, so an Agent is
 *   checked against it. An Admin reads every group in the product, as
 *   `canAccessGroup` lets them.
 * - A staff DM needs `staff_dm`, for an Admin as much as for an Agent: the API
 *   checks the capability before anything else (`canAccessStaffDm`) and has no
 *   bypass for it. Past that it names its peer relative to the viewer, and the
 *   API only resolves a peer for a participant. `members` is empty on that
 *   payload, so the peer is what there is to check.
 */
export function canViewConversation(
  viewer: ConversationViewer,
  conversation: Conversation,
): boolean {
  assertRole(viewer.role)
  if (conversation.type === 'broadcast_inbox') return true

  if (viewer.role === 'customer') {
    if (isStaffConversation(conversation)) return false
    if (conversation.type === 'support_dm') return true
    return conversation.members.some((member) => member.id === viewer.id)
  }

  // Staff. A staff role never receives the Customer-facing payload.
  if (!isStaffConversation(conversation)) return false

  switch (conversation.type) {
    case 'support_dm':
      return true
    case 'staff_dm':
      return can(viewer, 'staff_dm') && conversation.otherUser !== null
    default:
      return (
        viewer.role === 'admin' ||
        conversation.members.some((member) => member.id === viewer.id)
      )
  }
}

/**
 * Staff, and only while Support DMs are worked by assignment: a Shared queue
 * has no pool, because there is nothing a thread is waiting to be assigned to.
 */
export function canAccessUnassignedPool(role: UserRole, supportAssignment: boolean): boolean {
  assertRole(role)
  return supportAssignment && (role === 'agent' || role === 'admin')
}
