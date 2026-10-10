import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiFailure } from '@/lib/api-result'
import { useNotificationBadge } from '@/lib/notification-badge'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  NOTIFICATIONS_PAGE_LIMIT,
} from '@/lib/notification-api'
import { withAllRead, withArrived, withOlderPage, withRead } from '@/lib/notification-feed'
import { useRealtimeEvents } from '@/lib/realtime-context'
import { readNotice, type ReadNotice } from '@/lib/read-notice'
import type { AppNotification } from '@/lib/types'

/**
 * The Notifications screen's feed: what is held, how it pages, and the two
 * writes a person can make to it.
 *
 * Nothing is persisted. A feed is re-read when the screen opens and kept current
 * by the socket while it is open — an arrival goes on top, a read anywhere
 * flips its rows, and a Resync reads the first page again — so there is nothing
 * a cold start with no signal would gain from a copy on disk that the bell's
 * own count does not already say.
 *
 * Both writes take the three steps a send does: the row changes first, the
 * request follows it, and a refusal puts it back. The count the API answers
 * with is what the bell is then set to.
 */

export type NotificationFeedView = {
  notifications: AppNotification[]
  notice: ReadNotice
  unreadOnly: boolean
  setUnreadOnly: (unreadOnly: boolean) => void
  refreshing: boolean
  loadingOlder: boolean
  refresh: () => void
  retry: () => void
  dismissFailure: () => void
  loadOlder: () => void
  /** Mark one row read. Already-read rows make no request. */
  markRead: (notification: AppNotification) => void
  markAllRead: () => void
  markingAll: boolean
}

const COPY = {
  refusedTitle: 'Could not load your notifications',
  emptyTitle: 'You’re all caught up',
  emptyHint: 'Messages, invitations and announcements addressed to you will show up here.',
}

const UNREAD_COPY = {
  ...COPY,
  emptyTitle: 'No unread notifications',
  emptyHint: 'Everything here has been read.',
}

export function useNotificationFeed(): NotificationFeedView {
  const { unreadCount, setUnreadCount } = useNotificationBadge()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadOnly, setUnreadOnlyState] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  /** Which first-page read the answer coming back belongs to. */
  const generation = useRef(0)
  /** The rows as they stand, for a rollback that must not use a stale render's copy. */
  const held = useRef(notifications)
  const unreadOnlyRef = useRef(unreadOnly)
  useEffect(() => {
    held.current = notifications
    unreadOnlyRef.current = unreadOnly
  }, [notifications, unreadOnly])

  const loadFirst = useCallback((onlyUnread: boolean) => {
    const mine = (generation.current += 1)

    void listNotifications({ unreadOnly: onlyUnread }).then((result) => {
      if (generation.current !== mine) return
      setRefreshing(false)
      setLoading(false)

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      setNotifications(result.value)
      setHasMore(result.value.length >= NOTIFICATIONS_PAGE_LIMIT)
    })
  }, [])

  useEffect(() => {
    loadFirst(unreadOnly)
    return () => {
      generation.current += 1
    }
  }, [loadFirst, unreadOnly])

  const setUnreadOnly = useCallback((next: boolean) => {
    if (next === unreadOnlyRef.current) return
    // A different list, not a filter over this one: what is held for "All" is not
    // the first page of "Unread", so the screen goes back to loading.
    setNotifications([])
    setFailure(null)
    setHasMore(false)
    setLoading(true)
    setUnreadOnlyState(next)
  }, [])

  const loadOlder = useCallback(() => {
    if (loadingOlder || !hasMore || loading) return
    const last = held.current[held.current.length - 1]
    if (!last) return
    const mine = generation.current

    setLoadingOlder(true)
    void listNotifications({ cursor: last.id, unreadOnly: unreadOnlyRef.current }).then(
      (result) => {
        setLoadingOlder(false)
        if (generation.current !== mine) return

        if (!result.ok) {
          setFailure(result.failure)
          return
        }
        setFailure(null)
        setNotifications((current) => withOlderPage(current, result.value))
        setHasMore(result.value.length >= NOTIFICATIONS_PAGE_LIMIT)
      },
    )
  }, [hasMore, loading, loadingOlder])

  const refresh = useCallback(() => {
    setRefreshing(true)
    loadFirst(unreadOnlyRef.current)
  }, [loadFirst])

  const retry = useCallback(() => {
    setFailure(null)
    setLoading(true)
    loadFirst(unreadOnlyRef.current)
  }, [loadFirst])

  const dismissFailure = useCallback(() => setFailure(null), [])

  useRealtimeEvents((event) => {
    switch (event.kind) {
      case 'notification-created':
        // Every arrival is unread, so it belongs at the top of either list.
        if (event.notification) {
          const arrived = event.notification
          setNotifications((current) => withArrived(current, arrived))
        }
        return
      case 'notification-read': {
        const ids = event.notificationIds
        const readAt = new Date().toISOString()
        setNotifications((current) => withRead(current, ids, readAt))
        return
      }
      case 'resync':
        loadFirst(unreadOnlyRef.current)
        return
    }
  })

  const markRead = useCallback(
    (notification: AppNotification) => {
      if (notification.readAt !== null) return
      const readAt = new Date().toISOString()

      setNotifications((current) => withRead(current, [notification.id], readAt))
      setUnreadCount((count) => count - 1)

      void markNotificationsRead([notification.id]).then((result) => {
        if (result.ok) {
          setUnreadCount(result.value)
          return
        }
        // Put the row back as it was. The count goes back up with it; the next
        // read of the count corrects it if the server did record the read.
        setNotifications((current) =>
          current.map((row) => (row.id === notification.id ? { ...row, readAt: null } : row)),
        )
        setUnreadCount((count) => count + 1)
      })
    },
    [setUnreadCount],
  )

  const markAllRead = useCallback(() => {
    if (markingAll) return
    const before = held.current
    const countBefore = unreadCount

    setMarkingAll(true)
    setNotifications((current) => withAllRead(current, new Date().toISOString()))
    setUnreadCount(0)

    void markAllNotificationsRead().then((result) => {
      setMarkingAll(false)
      if (result.ok) {
        setUnreadCount(result.value)
        return
      }
      setNotifications(before)
      setUnreadCount(countBefore)
      setFailure(result.failure)
    })
  }, [markingAll, setUnreadCount, unreadCount])

  const notice = readNotice(
    { drawn: notifications.length, confirmed: notifications.length, loading, failure },
    unreadOnly ? UNREAD_COPY : COPY,
  )

  return {
    notifications,
    notice,
    unreadOnly,
    setUnreadOnly,
    refreshing,
    loadingOlder,
    refresh,
    retry,
    dismissFailure,
    loadOlder,
    markRead,
    markAllRead,
    markingAll,
  }
}
