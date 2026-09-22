import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import {
  parseAccountSessionAcknowledgement,
  parseAccountSessions,
} from '@/lib/account-session-parse'
import { authenticatedRequest } from '@/lib/auth-service'
import type { AccountSession } from '@/lib/types'

/**
 * The sessions on this person's own account, over the one transport this app
 * has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds paths, not a second way of talking to the API.
 *
 * Every route is behind `AuthGuard` and scoped to the caller's own id at the
 * service, so nothing here takes a user: there is no admin-sees-everyone path in
 * this family, and the one that exists for an Admin is `lib/user-api`'s
 * `revokeUserSessions`, which is a different surface with a different rule.
 *
 * ## `DELETE /sessions/:id` has no wrapper here, on purpose
 *
 * The route exists and works. It stays unsurfaced, mirroring root ADR 0008:
 * revoking ends access and leaves the record, while deleting erases the evidence
 * that a session existed at all. The session list is close to the only
 * device-level trail this product keeps, so a control that removes rows from it
 * would compound a cost that ADR already paid once. Anybody who needs the route
 * has it; what they do not have is a button.
 *
 * ## What revoking does and does not tell the other device
 *
 * Revoking many pushes a realtime signal to the devices it ended, while revoking
 * one does not. That asymmetry is recorded in root ADR 0008, was found during
 * the web design and triaged separately, and this module is built against it
 * rather than around it: a phone whose session was ended on its own learns at
 * its next call to the API, which is a `401`, which `authenticatedRequest`
 * already turns into an ordinary end of session.
 */

/**
 * The most sessions one page may hold.
 *
 * Fifty because the API's own `pageSize` is capped at 500 and a list of the
 * devices one person is signed in on is nowhere near either number. There is no
 * "load more" on this screen and there is deliberately no paging: root ADR 0008
 * ruled that paging, sorting and search over your own handful of devices is
 * machinery that costs maintenance and returns nothing.
 */
const SESSION_PAGE_SIZE = 50

/**
 * Where this account is signed in, newest session first.
 *
 * Active only. This screen answers "where is my account signed in", which is a
 * question about now; revoked and expired rows are history, and the screen that
 * would read them is the one root ADR 0008 declined to build.
 */
export async function readAccountSessions(): Promise<ApiResult<AccountSession[]>> {
  const path = `/sessions${query({
    status: 'active',
    page: 1,
    pageSize: SESSION_PAGE_SIZE,
    sort: 'createdAt',
    dir: 'desc',
  })}`
  return readOutcome(await authenticatedRequest(path), parseAccountSessions)
}

/**
 * End one other session.
 *
 * Never called for the session this app is holding. That is not enforced here,
 * because a module that answers paths is the wrong place to hold a rule about
 * what a screen offers: the rule lives in `lib/account-session-rows`, which
 * gives the current device no revoke control at all, and the reason is in
 * ADR-0012. Revoking the held session would work, and would be a sign-out that
 * did not say so.
 */
export async function revokeAccountSession(id: string): Promise<ApiResult<true>> {
  const path = `/sessions/${encodeURIComponent(id)}/revoke`
  return readOutcome(
    await authenticatedRequest(path, { method: 'POST' }),
    parseAccountSessionAcknowledgement,
  )
}

/**
 * End every session but this one.
 *
 * Takes nothing: which session is spared is the one the request is made under,
 * decided by the API from the cookie rather than by an id this client could get
 * wrong. Answers with a count nothing reads back.
 */
export async function revokeOtherAccountSessions(): Promise<ApiResult<true>> {
  return readOutcome(
    await authenticatedRequest('/sessions/revoke-others', { method: 'POST' }),
    parseAccountSessionAcknowledgement,
  )
}
