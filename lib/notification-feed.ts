import { dayKey } from '@/lib/message-day'
import type { PushRoute } from '@/lib/push-rules'
import type { AppNotification, UserRole } from '@/lib/types'

/**
 * The decisions behind the Notifications screen that are not about drawing it:
 * where a row goes when it is tapped, how the feed is split into Today,
 * Yesterday and Earlier, and how a page, an arrival or a read folds into what is
 * already held.
 *
 * Pure and table-tested, beside `lib/notification-api` which asks and
 * `lib/use-notification-feed` which holds — the same split as `wall-pages` and
 * `use-wall`.
 */

/**
 * Where a tapped row goes.
 *
 * `thread` opens a conversation, `route` is one of the screens a push about no
 * conversation already opens (`lib/push-rules`), and `broadcasts` is an Admin's
 * Broadcasts screen. Null is a row with nowhere to go — a declined join request,
 * or a kind this build has never heard of that names no thread — and a tap on it
 * only marks it read.
 */
export type NotificationDestination =
  | { kind: 'thread'; conversationId: string }
  | { kind: 'route'; route: PushRoute }
  | { kind: 'broadcasts' }

export type DestinationContext = {
  role: UserRole
  /**
   * The viewer's announcements thread, when the Conversation list holds one. A
   * Broadcast row carries no conversation of its own — the thread is written by
   * a listener that knows nothing about the row — and a recipient holds exactly
   * one, so it is looked up rather than carried.
   */
  announcementsId: string | null
  /** Whether this viewer may open the Broadcasts screen, which is an Admin's. */
  opensBroadcasts: boolean
}

/**
 * The web client's `getNotificationHref`, with this app's screens.
 *
 * The kind is read before `conversationId` for the kinds that route by kind, so
 * that a thread they happen to name later does not change where they go; every
 * other kind opens the thread it names, which is also the answer for a kind
 * this build has not been taught.
 */
export function notificationDestination(
  notification: AppNotification,
  context: DestinationContext,
): NotificationDestination | null {
  const thread = notification.conversationId
    ? ({ kind: 'thread', conversationId: notification.conversationId } as const)
    : null

  switch (notification.kind) {
    case 'broadcast':
      if (context.announcementsId) {
        return { kind: 'thread', conversationId: context.announcementsId }
      }
      if (context.role === 'admin' && context.opensBroadcasts) return { kind: 'broadcasts' }
      return { kind: 'route', route: { screen: 'conversations' } }

    case 'wall_post':
    case 'wall_post_reaction':
      return notification.wallPostId
        ? { kind: 'route', route: { screen: 'wall-post', postId: notification.wallPostId } }
        : null

    case 'organization_invitation':
      // A Customer's invitation is a card in their General Support, which the row
      // names; Staff answer theirs on Settings.
      return thread ?? { kind: 'route', route: { screen: 'invitations' } }

    case 'customer_registered':
      return thread ?? { kind: 'route', route: { screen: 'conversations' } }

    case 'content_reported':
      // A report names no thread; it is answered in the Admin's review queue.
      return { kind: 'route', route: { screen: 'reports' } }

    case 'customer_joined_organization':
      // The organization's Support DM is opened by a separate listener as the
      // membership lands, so the row cannot name it.
      return { kind: 'route', route: { screen: 'conversations' } }

    default:
      return thread
  }
}

export type NotificationSection = {
  key: 'today' | 'yesterday' | 'earlier'
  title: string
  data: AppNotification[]
}

const SECTIONS: readonly { key: NotificationSection['key']; title: string }[] = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'earlier', title: 'Earlier' },
]

/**
 * Three buckets rather than one per day, like the web client's panel: a heading
 * above every calendar date turns eight rows into sixteen.
 *
 * The reader's calendar day, through `dayKey`, rather than twenty-four hours
 * back — the same reason a thread's day divider is. Order within a bucket is
 * the order given, which is newest first, and an empty bucket is not drawn.
 */
export function notificationSections(
  notifications: AppNotification[],
  nowMs = Date.now(),
): NotificationSection[] {
  const now = new Date(nowMs)
  const today = dayKey(now.toISOString())
  const yesterday = dayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString(),
  )

  const buckets: Record<NotificationSection['key'], AppNotification[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  }
  for (const notification of notifications) {
    const day = dayKey(notification.createdAt)
    if (day === today) buckets.today.push(notification)
    else if (day === yesterday) buckets.yesterday.push(notification)
    else buckets.earlier.push(notification)
  }

  return SECTIONS.flatMap(({ key, title }) =>
    buckets[key].length > 0 ? [{ key, title, data: buckets[key] }] : [],
  )
}

/** An older page, after what is held. A row already held is not drawn twice. */
export function withOlderPage(
  held: AppNotification[],
  page: AppNotification[],
): AppNotification[] {
  const known = new Set(held.map((notification) => notification.id))
  return [...held, ...page.filter((notification) => !known.has(notification.id))]
}

/**
 * A row that has just been written, at the top. One already held — the socket
 * and a refetch can both bring it — replaces the copy in place instead.
 */
export function withArrived(
  held: AppNotification[],
  arrived: AppNotification,
): AppNotification[] {
  if (held.some((notification) => notification.id === arrived.id)) {
    return held.map((notification) => (notification.id === arrived.id ? arrived : notification))
  }
  return [arrived, ...held]
}

/**
 * These rows read, as of `readAt`. A row already read keeps the time it was
 * read at, and the list is handed back unchanged when nothing changed, so a
 * read announced twice does not draw twice.
 */
export function withRead(
  held: AppNotification[],
  ids: Iterable<string>,
  readAt: string,
): AppNotification[] {
  const flipping = new Set(ids)
  let changed = false
  const next = held.map((notification) => {
    if (notification.readAt !== null || !flipping.has(notification.id)) return notification
    changed = true
    return { ...notification, readAt }
  })
  return changed ? next : held
}

/** Every row read, as of `readAt`. */
export function withAllRead(held: AppNotification[], readAt: string): AppNotification[] {
  return withRead(
    held,
    held.map((notification) => notification.id),
    readAt,
  )
}

/** What the bell says aloud and shows: nothing at zero, `99+` past ninety-nine. */
export function unreadBadgeLabel(count: number): string | null {
  if (count <= 0) return null
  return count > 99 ? '99+' : String(count)
}
