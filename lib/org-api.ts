import { acknowledged, query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseAcknowledgement,
  parseCustomInbox,
  parseCustomInboxes,
  parseInvitations,
  parseInviteOutcome,
  parseOrganizationMembers,
  parseOrganizationSummaries,
  parseOrganizationSummary,
} from '@/lib/org-parse'
import type {
  CustomInbox,
  Invitation,
  InviteOutcome,
  OrganizationMember,
  OrganizationSummary,
} from '@/lib/types'

/**
 * The organization endpoints, and the two families that hang off them:
 * memberships — who is in an organization, and the invitations that put them
 * there — and custom inboxes, which are a saved set of organizations to filter
 * the conversation list by.
 *
 * One module rather than three, because they are one subject: everything here
 * is about which organizations exist and who belongs to them, and a screen
 * that touches one of them usually touches the next. The transport, the
 * envelope and the four failures are `lib/api-result`'s, the same ones
 * `lib/conversation-api` reads through.
 *
 * Membership is never granted directly. An Admin invites and the person
 * accepts — which is the API's rule (`POST /invitations` is the only way in)
 * and the reason nothing here has an `addMember`.
 */

/**
 * Every organization, for an Admin.
 *
 * Admin-only server-side: `OrganizationsPolicy.assertCanManageOrganizations`
 * refuses everyone else, and the refusal arrives as `refused` rather than as
 * an empty list, which is what lets the screen say so. Sorted by name because
 * a directory read by a person is read alphabetically; the API paginates, and
 * a hundred is more organizations than this product has.
 */
export async function listOrganizations(
  params: { search?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResult<OrganizationSummary[]>> {
  const search = params.search?.trim()
  const path = `/organizations${query({
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
    sort: 'name',
    dir: 'asc',
    search: search === '' ? undefined : search,
  })}`
  return readOutcome(await authenticatedRequest(path), parseOrganizationSummaries)
}

export async function createOrganization(
  name: string,
): Promise<ApiResult<OrganizationSummary>> {
  const outcome = await authenticatedRequest('/organizations', {
    method: 'POST',
    body: { name },
  })
  return readOutcome(outcome, parseOrganizationSummary)
}

export async function renameOrganization(
  id: string,
  name: string,
): Promise<ApiResult<OrganizationSummary>> {
  const outcome = await authenticatedRequest(`/organizations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name },
  })
  return readOutcome(outcome, parseOrganizationSummary)
}

/**
 * Delete an organization.
 *
 * Content-destroying and not undoable, so nothing calls this without a
 * confirmation in front of it — see `components/hub/organizations-screen`.
 */
export async function deleteOrganization(id: string): Promise<ApiResult<true>> {
  const outcome = await authenticatedRequest(`/organizations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, parseAcknowledgement)
}

/** Who has accepted into this organization. Members, not invitations. */
export async function listOrganizationMembers(
  organizationId: string,
): Promise<ApiResult<OrganizationMember[]>> {
  const path = `/memberships/organization/${encodeURIComponent(organizationId)}`
  return readOutcome(await authenticatedRequest(path), parseOrganizationMembers)
}

/**
 * Take somebody out of an organization.
 *
 * Immediate, unlike putting them in: the API revokes the membership and
 * reassigns whatever the loss of it made unreadable — see the
 * `membership_revoked` reason on `conversation.reassigned`.
 */
export async function removeMembership(
  userId: string,
  organizationId: string,
): Promise<ApiResult<true>> {
  const path = `/memberships/${encodeURIComponent(userId)}/${encodeURIComponent(organizationId)}`
  return readOutcome(await authenticatedRequest(path, { method: 'DELETE' }), parseAcknowledgement)
}

/**
 * Invite somebody into one or more organizations.
 *
 * The answer is three lists rather than a yes: an invitation was created, the
 * person was already a member, or one was already pending. Repeating an invite
 * is therefore not an error, and the screen says which of the three happened
 * rather than claiming an invitation that was not sent.
 */
export async function inviteToOrganizations(
  userId: string,
  organizationIds: string[],
): Promise<ApiResult<InviteOutcome>> {
  const outcome = await authenticatedRequest('/invitations', {
    method: 'POST',
    body: { userId, organizationIds },
  })
  return readOutcome(outcome, parseInviteOutcome)
}

/** The invitations addressed to the signed-in person, whatever their role. */
export async function listMyInvitations(): Promise<ApiResult<Invitation[]>> {
  return readOutcome(await authenticatedRequest('/invitations/mine'), parseInvitations)
}

export async function acceptInvitation(id: string): Promise<ApiResult<true>> {
  const path = `/invitations/${encodeURIComponent(id)}/accept`
  return readOutcome(await authenticatedRequest(path, { method: 'POST' }), parseAcknowledgement)
}

export async function declineInvitation(id: string): Promise<ApiResult<true>> {
  const path = `/invitations/${encodeURIComponent(id)}/decline`
  return readOutcome(await authenticatedRequest(path, { method: 'POST' }), parseAcknowledgement)
}

/** Withdraw an invitation nobody has answered. Admin's side of the same pair. */
export async function cancelInvitation(id: string): Promise<ApiResult<true>> {
  const path = `/invitations/${encodeURIComponent(id)}`
  return readOutcome(await authenticatedRequest(path, { method: 'DELETE' }), parseAcknowledgement)
}

/** The signed-in person's saved inboxes. Theirs alone; there is no shared one. */
export async function listCustomInboxes(): Promise<ApiResult<CustomInbox[]>> {
  return readOutcome(await authenticatedRequest('/inboxes'), parseCustomInboxes)
}

export async function createCustomInbox(
  name: string,
  organizationIds: string[],
): Promise<ApiResult<CustomInbox>> {
  const outcome = await authenticatedRequest('/inboxes', {
    method: 'POST',
    body: { name, organizationIds },
  })
  return readOutcome(outcome, parseCustomInbox)
}

/**
 * Rename an inbox, change what it keeps, or both.
 *
 * Both fields are optional and the API refuses a body with neither, so the
 * caller has to mean something by it; an absent key leaves that half alone.
 */
export async function updateCustomInbox(
  id: string,
  changes: { name?: string; organizationIds?: string[] },
): Promise<ApiResult<CustomInbox>> {
  const outcome = await authenticatedRequest(`/inboxes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.organizationIds === undefined
        ? {}
        : { organizationIds: changes.organizationIds }),
    },
  })
  return readOutcome(outcome, parseCustomInbox)
}

export async function deleteCustomInbox(id: string): Promise<ApiResult<void>> {
  const outcome = await authenticatedRequest(`/inboxes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, acknowledged)
}
