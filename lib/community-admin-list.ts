import type { Community } from '@/lib/types'

/**
 * What the Admin Hub's Communities screen says about whose Communities it lists.
 *
 * That screen is every Community in the product — `GET /communities` answers an
 * Admin with all of them — while the Communities tab and the web inbox list only
 * the ones somebody belongs to. Both are right, and the same account seeing two
 * counts read as a bug until the screen said which list it was (BUG-38). So the
 * screen says it twice: once above the list, and once on every row the viewer
 * has not joined. Pure, so the wording and the count can be table-tested.
 */

/** Whether the viewer is a member of this Community. No viewer is nobody's member. */
export function isCommunityMember(community: Community, viewerId: string | null): boolean {
  return viewerId !== null && community.memberIds.includes(viewerId)
}

/** The marker drawn on a row the viewer has not joined. */
export const NOT_A_MEMBER_LABEL = 'Not a member'

/**
 * The line above the list: that it is every Community, and how many of them the
 * viewer is in. Counted over the whole list rather than what a search left, since
 * it describes the list and not the filter. `null` before the list has arrived
 * says only the first half, which is true whatever the answer turns out to be.
 */
export function adminCommunitiesCaption(
  communities: readonly Community[] | null,
  viewerId: string | null,
): string {
  if (communities === null) return 'Every community in the product, not only yours'
  const total = communities.length
  if (total === 0) return 'Every community in the product, not only yours'
  const joined = communities.filter((community) => isCommunityMember(community, viewerId)).length
  const all = total === 1 ? 'The 1 community in the product' : `All ${total} communities in the product`
  if (joined === total) return `${all} · you're in ${total === 1 ? 'it' : 'all of them'}`
  if (joined === 0) return `${all} · you're in none`
  return `${all} · you're in ${joined}`
}
