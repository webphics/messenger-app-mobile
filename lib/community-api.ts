import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseCommunities,
  parseCommunityFeed,
  parseGroupJoinOutcome,
  parseLeftCommunity,
} from '@/lib/community-parse'
import type { Community, CommunityFeedRow, GroupJoinOutcome } from '@/lib/types'

/**
 * The Community endpoints a member's phone reads, over the one transport this
 * app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds paths, not a second way of talking to the API.
 *
 * Two reads and, since #73, the two writes a member's own half of a Community
 * needs: joining a linked Group, and leaving the Community itself. Creating,
 * renaming, linking a Group, promoting a Moderator, answering a Join request
 * and every other route on that controller stay on web — see `docs/scope.md`.
 * A phone gets the member's half.
 */

/**
 * The most Communities one page may hold. The API refuses anything above a
 * hundred and defaults to fifty; this names the number rather than letting the
 * default decide.
 *
 * There is no paging past it. A Community is a place somebody was put, not a
 * feed — a person is in a handful — and an Admin's answer, which is the only one
 * that can be long, is narrowed to their own memberships on this device anyway.
 */
const COMMUNITY_PAGE_LIMIT = 100

/**
 * Every Community this request is allowed to see, which for an Admin is every
 * Community there is.
 *
 * Narrowing to the viewer's own memberships is `lib/community-list`, on this
 * side of the transport, because the API has no parameter for it and because a
 * Community somebody is not in must be invisible rather than refused.
 */
export async function listCommunities(): Promise<ApiResult<Community[]>> {
  const outcome = await authenticatedRequest(
    `/communities${query({ limit: COMMUNITY_PAGE_LIMIT })}`,
  )
  return readOutcome(outcome, parseCommunities)
}

/**
 * What one Community holds, as the person asking sees it: the pinned
 * Announcements thread, the Groups they are in, and the Groups they are not.
 *
 * Refused with a 404 for a Community the asker is not in — the API's
 * never-a-403 rule for this module — which reaches a screen as an ordinary
 * refusal and says what it says.
 */
export async function listCommunityGroups(
  communityId: string,
): Promise<ApiResult<CommunityFeedRow[]>> {
  const outcome = await authenticatedRequest(`/communities/${communityId}/groups`)
  return readOutcome(outcome, parseCommunityFeed)
}

/**
 * A member entering a linked Group themselves, rather than waiting for a
 * Moderator to add them.
 *
 * What the tap means is decided by the Group's own Join policy, not by this
 * client: under `open` it joins immediately, under `request` — the default —
 * it opens an ask a Moderator answers. One route either way; `GroupJoinOutcome`
 * is how the caller tells which happened.
 */
export async function joinLinkedGroup(
  communityId: string,
  groupId: string,
): Promise<ApiResult<GroupJoinOutcome>> {
  const outcome = await authenticatedRequest(
    `/communities/${communityId}/groups/${groupId}/join`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseGroupJoinOutcome)
}

/**
 * A member leaving the Community itself, from the overflow menu on its
 * screen. Available to any member; there is nothing here for administering
 * one, which stays on web.
 */
export async function leaveCommunity(communityId: string): Promise<ApiResult<{ id: string }>> {
  const outcome = await authenticatedRequest(`/communities/${communityId}/members/me`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, parseLeftCommunity)
}
