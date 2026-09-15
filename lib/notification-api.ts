import { readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { parseNotificationSettings } from '@/lib/notification-parse'
import type { NotificationSettings } from '@/lib/types'

/**
 * The notification settings endpoints, over the one transport this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline.
 *
 * Only the Post half is here. Muting a thread and opting out of Broadcasts are
 * the API's other two settings and neither has a surface on a phone yet; the
 * document they live in is parsed whole because every write answers with it, and
 * reading a field is not a reason to invent a screen for it.
 */

/** The standing answers the API keeps about who may notify this person. */
export async function readNotificationSettings(): Promise<ApiResult<NotificationSettings>> {
  const outcome = await authenticatedRequest('/notifications/settings')
  return readOutcome(outcome, parseNotificationSettings)
}

/**
 * Say whether this organization's Posts may notify this person.
 *
 * One function rather than the API's two routes: the switch has one meaning and
 * the method is the detail of saying it. Both answer with the settings as they
 * now stand, which is what lets a caller replace what it holds rather than
 * assuming the change it asked for — an opt-in the API has already recorded
 * answers the same way as one it has just written.
 */
export async function setPostNotifications(
  organizationId: string,
  on: boolean,
): Promise<ApiResult<NotificationSettings>> {
  const outcome = await authenticatedRequest(
    `/notifications/post-organizations/${encodeURIComponent(organizationId)}`,
    { method: on ? 'PUT' : 'DELETE' },
  )
  return readOutcome(outcome, parseNotificationSettings)
}
