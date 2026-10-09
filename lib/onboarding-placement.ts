import { can, type CapabilityViewer } from '@/lib/capabilities'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, ConversationPerson, InviteOutcome } from '@/lib/types'

/**
 * The Customer a staff viewer may invite to organizations from this conversation, or null.
 *
 * Only General Support offers it: the Support DM with no organization, where Invitation cards
 * arrive. It never ends, so it offers it whatever the Customer has joined already; the API reports
 * `onboardingOpen` true on every General Support, and anything but `true` (an older payload)
 * offers nothing. Only the staff payload names its Customer, and only a viewer holding
 * `manage_memberships` can make the call. The API still decides whether the viewer covers the
 * organizations they pick, so this answers whether to draw the section, not whether the write will
 * be accepted. The web client asks the same question in `features/inbox/utils/onboarding.utils`.
 */
export function placeableOnboardingCustomer(
  viewer: CapabilityViewer,
  conversation: Conversation | null | undefined,
): ConversationPerson | null {
  if (!conversation || !isStaffConversation(conversation)) return null
  if (conversation.type !== 'support_dm' || conversation.organizationId) return null
  if (conversation.onboardingOpen !== true) return null
  if (!can(viewer, 'manage_memberships')) return null
  return conversation.customer ?? null
}

/**
 * The selection after a tap on one organization: in if it was out, out if it was in. Order is
 * kept as tapped, which is the order the button's count and the request carry them.
 */
export function toggleOrganization(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
}

/** What the confirm button says for a selection of this size. */
export function assignLabel(count: number): string {
  if (count <= 1) return 'Send invitation'
  return `Invite to ${count} organizations`
}

/**
 * What the viewer is told after an invite from General Support. Each list can be empty on its
 * own, so the sentence is built from whichever are not.
 */
export function invitationSummary(
  name: string,
  outcome: Pick<InviteOutcome, 'invited' | 'alreadyInvited' | 'alreadyMembers'>,
): string {
  const names = (rows: { name: string }[]) => rows.map((row) => row.name).join(', ')
  const parts = [
    outcome.invited.length > 0 ? `Invitation sent to ${name} for ${names(outcome.invited)}` : null,
    outcome.alreadyInvited.length > 0 ? `already invited to ${names(outcome.alreadyInvited)}` : null,
    outcome.alreadyMembers.length > 0 ? `already in ${names(outcome.alreadyMembers)}` : null,
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return `${name} was not invited to any organization`
  return outcome.invited.length > 0 ? parts.join('; ') : `${name} is ${parts.join(', and ')}`
}
