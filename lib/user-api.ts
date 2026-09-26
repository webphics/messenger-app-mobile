import { query, readOutcome } from '@/lib/api-result'
import type { ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseManagedUser,
  parseManagedUsers,
  parseStaffPermissions,
  parseUserAcknowledgement,
} from '@/lib/user-parse'
import type { Capability } from '@/lib/capabilities'
import type { ManagedUser, StaffPermissions, UserRole } from '@/lib/types'

/**
 * The Admin user directory.
 *
 * Every route here is `@Roles(['admin'])` at the controller, so an Agent
 * asking for any of them is answered `403` — which arrives as `refused` and
 * lets the screen say so rather than showing an empty directory. Nothing in
 * the app reaches these paths from a non-Admin surface.
 *
 * Two things this deliberately does not do. It never grants a membership:
 * an Admin invites and the person accepts, which is the API's only way in and
 * why creating a user takes organization ids that become invitations. And it
 * never sets a password on anybody's behalf without an Admin typing one — the
 * reset route takes the password from the field on screen and nothing here
 * generates one.
 */

export type UserFilter = {
  search?: string
  /** Empty or absent means every role. Sent as the API's comma-separated list. */
  roles?: UserRole[]
  isBanned?: boolean
  page?: number
  pageSize?: number
}

/**
 * One page of the directory, newest accounts last.
 *
 * Sorted by name because a directory read by a person is read alphabetically,
 * and filtered server-side: the whole user table is the one list in this app
 * a phone should not be narrowing for itself.
 */
export async function listUsers(filter: UserFilter = {}): Promise<ApiResult<ManagedUser[]>> {
  const search = filter.search?.trim()
  const path = `/users${query({
    page: filter.page ?? 1,
    pageSize: filter.pageSize ?? 50,
    sort: 'name',
    dir: 'asc',
    search: search === '' ? undefined : search,
    role: filter.roles && filter.roles.length > 0 ? filter.roles.join(',') : undefined,
    isBanned: filter.isBanned,
  })}`
  return readOutcome(await authenticatedRequest(path), parseManagedUsers)
}

/**
 * Create an account.
 *
 * At least one organization is required by the API, so nobody is created into
 * a vacuum — and what those ids produce is invitations rather than
 * memberships. The password is optional: an account created without one is
 * reached by magic link, which is how a Customer account comes into existence
 * everywhere else in this product.
 */
export async function createUser(draft: {
  name?: string
  email: string
  role: UserRole
  organizationIds: string[]
  password?: string
}): Promise<ApiResult<ManagedUser>> {
  const name = draft.name?.trim()
  const password = draft.password?.trim()
  const outcome = await authenticatedRequest('/users', {
    method: 'POST',
    // `.strict()`, so each empty field is an absent key rather than a null the
    // schema would take as a deliberate clearing.
    body: {
      email: draft.email.trim(),
      role: draft.role,
      organizationIds: draft.organizationIds,
      ...(name ? { name } : {}),
      ...(password ? { password } : {}),
    },
  })
  return readOutcome(outcome, parseManagedUser)
}

/**
 * Change what somebody is.
 *
 * Its own route rather than part of the user update, because it is its own
 * decision: becoming an Agent grants every capability, and stopping being one
 * takes them away. The answer is the whole row, so the directory replaces it
 * rather than refetching the page.
 */
export async function setUserRole(
  id: string,
  role: UserRole,
): Promise<ApiResult<ManagedUser>> {
  const outcome = await authenticatedRequest(`/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: { role },
  })
  return readOutcome(outcome, parseManagedUser)
}

/**
 * Ban somebody, or lift one.
 *
 * `expiresAt` omitted is a permanent ban — the API treats "no expiry" as the
 * deliberate way to say forever rather than as a field somebody forgot.
 */
export async function banUser(
  id: string,
  reason?: string,
): Promise<ApiResult<ManagedUser>> {
  const trimmed = reason?.trim()
  const outcome = await authenticatedRequest(`/users/${encodeURIComponent(id)}/ban`, {
    method: 'POST',
    body: trimmed ? { reason: trimmed } : {},
  })
  return readOutcome(outcome, parseManagedUser)
}

export async function unbanUser(id: string): Promise<ApiResult<ManagedUser>> {
  const outcome = await authenticatedRequest(`/users/${encodeURIComponent(id)}/unban`, {
    method: 'POST',
  })
  return readOutcome(outcome, parseManagedUser)
}

/** Sign somebody out of everywhere. Answers with a count nothing reads back. */
export async function revokeUserSessions(id: string): Promise<ApiResult<true>> {
  const path = `/users/${encodeURIComponent(id)}/sessions/revoke`
  return readOutcome(
    await authenticatedRequest(path, { method: 'POST' }),
    parseUserAcknowledgement,
  )
}

/**
 * Clear somebody's second factor, so they can set a new one up.
 *
 * Revokes their sessions as a side effect, which is the API's doing and the
 * right one: a second factor that has just been removed should not leave a
 * signed-in device behind it.
 */
export async function resetUserTwoFactor(id: string): Promise<ApiResult<true>> {
  const path = `/users/${encodeURIComponent(id)}/2fa/reset`
  return readOutcome(
    await authenticatedRequest(path, { method: 'POST' }),
    parseUserAcknowledgement,
  )
}

/**
 * Set somebody's password to one an Admin typed.
 *
 * Revokes their sessions too, for the reason the two-factor reset does: a
 * credential that has just changed should not leave the old one's devices
 * signed in.
 */
export async function resetUserPassword(
  id: string,
  password: string,
): Promise<ApiResult<true>> {
  const path = `/users/${encodeURIComponent(id)}/password`
  return readOutcome(
    await authenticatedRequest(path, { method: 'POST', body: { password } }),
    parseUserAcknowledgement,
  )
}

/**
 * Delete an account.
 *
 * Irreversible, so nothing calls this without a confirmation in front of it
 * naming who is about to go.
 */
export async function deleteUser(id: string): Promise<ApiResult<true>> {
  const path = `/users/${encodeURIComponent(id)}`
  return readOutcome(
    await authenticatedRequest(path, { method: 'DELETE' }),
    parseUserAcknowledgement,
  )
}

/**
 * A staff member's capabilities, and which of them this viewer may toggle.
 * Nothing on mobile edits them yet; the web Users page does.
 */
export async function getStaffPermissions(
  id: string,
): Promise<ApiResult<StaffPermissions>> {
  const path = `/users/${encodeURIComponent(id)}/permissions`
  return readOutcome(await authenticatedRequest(path), parseStaffPermissions)
}

/**
 * Sends the full desired set: a capability left out is revoked. A change
 * outside what this viewer may edit refuses the whole request with a 403,
 * which arrives as `refused` carrying the API's message.
 */
export async function setStaffPermissions(
  id: string,
  capabilities: Capability[],
): Promise<ApiResult<StaffPermissions>> {
  const outcome = await authenticatedRequest(
    `/users/${encodeURIComponent(id)}/permissions`,
    { method: 'PATCH', body: { capabilities } },
  )
  return readOutcome(outcome, parseStaffPermissions)
}
