import { can, type CapabilityViewer } from '@/lib/capabilities'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, ConversationPerson } from '@/lib/types'

/**
 * The Customer a staff viewer may place in organizations from this conversation, or null.
 *
 * Only a live Onboarding thread offers it: a Support DM with no organization, which is the one
 * conversation whose purpose is finding out where somebody belongs. The thread ends when its
 * Customer joins an organization but still opens by id (a push, a link, a row restored from the
 * Store) with no organization, so only the API's `onboardingOpen` says the Customer is still
 * unplaced, and anything but `true` offers nothing. Only the staff payload names its Customer,
 * and only a viewer holding `manage_memberships` can make the call. The API still decides
 * whether the viewer covers the organizations they pick, so this answers whether to draw the
 * section, not whether the write will be accepted. The web client asks the same question in
 * `features/inbox/utils/onboarding.utils`.
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
  if (count <= 1) return 'Add to organization'
  return `Add to ${count} organizations`
}
