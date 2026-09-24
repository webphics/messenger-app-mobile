import { isStaffConversation } from '@/lib/types'
import type { Conversation, UserRole } from '@/lib/types'

const ROLES: readonly UserRole[] = ['admin', 'agent', 'customer']

function assertRole(role: UserRole): void {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown role: ${String(role)}`)
  }
}

/**
 * Whether this role may open this conversation.
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
 * - A Customer's own payload carries no participant list for a Support DM, and
 *   nothing identifying whose thread it is. There is nothing to check, and
 *   pretending otherwise would be a check that reads as a decision while
 *   deciding nothing. What is checked is the shape: a Customer holding the staff
 *   payload is holding something that was never meant for them.
 * - An Agent sees every Support DM in their organizations — assigned to anyone,
 *   unassigned, or closed (ADR 0005 on the API side). Assignment is not what
 *   gates visibility, which is why Takeover can exist at all.
 * - Groups and announcements carry their full membership, customers included,
 *   so those are checked properly.
 * - A staff DM names its peer relative to the viewer, and the API only resolves
 *   a peer for a participant. `members` is empty on that payload, so the peer is
 *   what there is to check.
 */
export function canViewConversation(
  role: UserRole,
  userId: string,
  conversation: Conversation,
): boolean {
  assertRole(role)
  if (role === 'admin') return true

  if (role === 'customer') {
    if (isStaffConversation(conversation)) return false
    if (conversation.type === 'support_dm') return true
    /*
     * An Announcements thread names no members — it has one reader, and the API
     * only ever sends it to them. There is nobody to check this viewer against,
     * and the send is the check.
     */
    if (conversation.type === 'broadcast_inbox') return true
    return conversation.members.some((member) => member.id === userId)
  }

  // Agent. A staff role never receives the Customer-facing payload.
  if (!isStaffConversation(conversation)) return false

  switch (conversation.type) {
    case 'support_dm':
      return true
    case 'staff_dm':
      return conversation.otherUser !== null
    default:
      return conversation.members.some((member) => member.id === userId)
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

export function canSeeInternalNotes(role: UserRole): boolean {
  assertRole(role)
  return role === 'agent' || role === 'admin'
}

export function canDeleteMessage(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canDeleteConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canAssignConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canBroadcast(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canManageUsers(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}
