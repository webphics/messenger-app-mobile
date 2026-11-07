import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'

import { useAuth } from '@/lib/auth-context'
import { readUnreadNotificationCount } from '@/lib/notification-api'
import { needsTerms } from '@/lib/onboarding-gate'
import { useRealtimeEvents } from '@/lib/realtime-context'

/**
 * How many rows of the notification feed this person has not read — the number
 * the bell on the Hub wears.
 *
 * Held above the navigator rather than by the bell, because the bell and the
 * Notifications screen both move it and must agree: a row opened on the screen
 * takes one off the bell before the screen is even left.
 *
 * The API is the authority and the socket keeps it current: both
 * `notification.created` and `notification.read` carry the count as it now
 * stands, so nothing here adds or subtracts on its own account except the
 * optimistic step a read on this phone takes before its answer arrives. It is
 * re-read on the way in, on every foreground — the socket is not torn down
 * behind something, but a phone that slept may have missed what was emitted —
 * and on a Resync, which is the socket saying exactly that.
 *
 * A read that fails leaves the count where it was. A bell showing the last
 * count it knew is truer than one showing zero because a request did not land.
 */

type NotificationBadgeValue = {
  unreadCount: number
  /** Set the count to what the API, or an optimistic step towards it, says. */
  setUnreadCount: (next: number | ((current: number) => number)) => void
}

const NotificationBadgeContext = createContext<NotificationBadgeValue | null>(null)

export function NotificationBadgeProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.status === 'signed-in' ? state.user.id : null
  /**
   * The count, and whose it is. Somebody else's count is not this person's
   * whatever the next read says, so a count held for anybody but the person
   * signed in now reads as zero rather than being reset in an effect.
   */
  const [held, setHeld] = useState<{ owner: string | null; count: number }>({
    owner: null,
    count: 0,
  })
  const unreadCount = held.owner !== null && held.owner === userId ? held.count : 0

  const owner = useRef(userId)
  useEffect(() => {
    owner.current = userId
  }, [userId])

  const setCount = useCallback((next: number | ((current: number) => number)) => {
    setHeld((current) => {
      const mine = current.owner === owner.current ? current.count : 0
      const count = typeof next === 'function' ? next(mine) : next
      return { owner: owner.current, count: Math.max(0, count) }
    })
  }, [])

  /** Which read the answer belongs to, so a slow answer cannot overwrite a newer one. */
  const generation = useRef(0)

  const refetch = useCallback(() => {
    const mine = (generation.current += 1)
    void readUnreadNotificationCount().then((result) => {
      if (generation.current !== mine || !result.ok) return
      setCount(result.value)
    })
  }, [setCount])

  /**
   * Read once the person may use the API. Before they agree to the Terms of
   * Use the API refuses the read with `terms_required`, so the badge would sit
   * at zero until the app next came to the foreground.
   */
  const owesTerms = state.status === 'signed-in' && needsTerms(state.user)
  useEffect(() => {
    generation.current += 1
    if (!userId || owesTerms) return

    refetch()
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refetch()
    })
    return () => subscription.remove()
  }, [refetch, userId, owesTerms])

  useRealtimeEvents((event) => {
    if (!userId) return
    switch (event.kind) {
      case 'notification-created':
      case 'notification-read':
        if (event.unreadCount !== null) {
          // The socket's count is newer than any read still in flight.
          generation.current += 1
          setCount(event.unreadCount)
        }
        return
      case 'resync':
        refetch()
        return
    }
  })

  const setUnreadCount = useCallback(
    (next: number | ((current: number) => number)) => {
      generation.current += 1
      setCount(next)
    },
    [setCount],
  )

  const value = useMemo(() => ({ unreadCount, setUnreadCount }), [unreadCount, setUnreadCount])

  return (
    <NotificationBadgeContext.Provider value={value}>{children}</NotificationBadgeContext.Provider>
  )
}

export function useNotificationBadge(): NotificationBadgeValue {
  const value = useContext(NotificationBadgeContext)
  if (!value) {
    throw new Error('useNotificationBadge must be used inside a NotificationBadgeProvider')
  }
  return value
}
