import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import {
  parseNotifications,
  parseNotificationSettings,
  parseUnreadCount,
} from '@/lib/notification-parse'
import type { AppNotification, NotificationSettings } from '@/lib/types'

/**
 * The notification settings endpoints, over the one transport this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline.
 *
 * Of the settings, only the Post half is here. Muting a thread and opting out of
 * Broadcasts are the API's other two and neither has a surface on a phone yet;
 * the document they live in is parsed whole because every write answers with it,
 * and reading a field is not a reason to invent a screen for it.
 *
 * The feed is the other half: the rows `GET /notifications` holds for this
 * person, the count the bell wears, and the two ways of marking them read.
 */

/** How many rows a page of the feed asks for. */
export const NOTIFICATIONS_PAGE_LIMIT = 30

/**
 * A page of this person's feed, newest first.
 *
 * `cursor` is the id of the last row on the previous page; the API pages on the
 * row's own time and id, so a burst written in one millisecond cannot be skipped
 * across a page boundary. A cursor it cannot resolve is a refusal rather than
 * page one again.
 */
export async function listNotifications(
  params: { cursor?: string; limit?: number; unreadOnly?: boolean } = {},
): Promise<ApiResult<AppNotification[]>> {
  const outcome = await authenticatedRequest(
    `/notifications${query({
      cursor: params.cursor,
      limit: params.limit ?? NOTIFICATIONS_PAGE_LIMIT,
      unreadOnly: params.unreadOnly ? true : undefined,
    })}`,
  )
  return readOutcome(outcome, parseNotifications)
}

/** How many rows of the feed this person has not read. */
export async function readUnreadNotificationCount(): Promise<ApiResult<number>> {
  const outcome = await authenticatedRequest('/notifications/unread-count')
  return readOutcome(outcome, parseUnreadCount)
}

/**
 * Mark these rows read. Answers the unread count as it now stands, which is
 * what the bell is set to rather than a count worked out on this phone — ids
 * the API had already read, or never held, change nothing and say so.
 */
export async function markNotificationsRead(ids: string[]): Promise<ApiResult<number>> {
  const outcome = await authenticatedRequest('/notifications/read', {
    method: 'POST',
    body: { ids },
  })
  return readOutcome(outcome, parseUnreadCount)
}

/** Mark every row read. The count it answers is always zero. */
export async function markAllNotificationsRead(): Promise<ApiResult<number>> {
  const outcome = await authenticatedRequest('/notifications/read-all', { method: 'POST' })
  return readOutcome(outcome, parseUnreadCount)
}

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
