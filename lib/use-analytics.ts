import { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

import { getAnalyticsOverview } from '@/lib/analytics-api'
import { analyticsCharts } from '@/lib/analytics-charts'
import { useAuth } from '@/lib/auth-context'
import type { AnalyticsOverview, ChartMetric } from '@/lib/types'
import { useSupportAssignment } from '@/lib/use-support-assignment'

/**
 * The Admin Hub's charts, read from `GET /analytics/overview`.
 *
 * One read, on focus, with no range of its own — the API's default is thirty
 * whole UTC days and it echoes back what it used, so there is nothing for this
 * app to pick and nothing for a picker to disagree with. A range control is a
 * screen of its own and does not exist here yet.
 *
 * Three states, and the fourth case handled the way `lib/use-wall-highlights`
 * handles it: a refresh that fails over charts already drawn keeps them. The
 * numbers on screen were true when they were read, and replacing a desk's
 * figures with an error because a later poll missed is worse than showing a
 * reading a few minutes old. Only a first read with nothing behind it becomes
 * `unavailable`, which is what the section draws its failure from.
 *
 * `refresh` is what pull-to-refresh on the detail screen calls. It is a real
 * request — the screen it replaced ran `useSimulatedRefresh(() => {})`, a
 * spinner over a function that did nothing, which was honest only while the
 * numbers underneath it were invented.
 *
 * The overview is held and the charts derived from it, rather than mapped once
 * on arrival, because which charts it becomes depends on the Shared queue
 * switch — and that can move under a Hub already drawn, when a session is
 * re-read, without anything being fetched again.
 */

export type AnalyticsView = {
  status: 'loading' | 'ready' | 'unavailable'
  /** Every chart the overview produced, empty until one has been read. */
  charts: ChartMetric[]
  /**
   * Open Support DMs whose latest message is the Customer's, right now. Null
   * until an overview has been read, and from an API that does not send it.
   */
  awaitingReply: number | null
  /** True while a pull-to-refresh is in flight, never for the first read. */
  refreshing: boolean
  refresh: () => void
}

export function useAnalytics(): AnalyticsView {
  const { state } = useAuth()
  const signedIn = state.status === 'signed-in'

  const [status, setStatus] = useState<AnalyticsView['status']>('loading')
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const supportAssignment = useSupportAssignment()
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Which read is the current one, so a focus or a pull landing while an earlier
   * read is still out cannot be overwritten by that earlier answer. Bumped on
   * cleanup too, which is what keeps an answer from landing after a sign-out.
   */
  const readId = useRef(0)

  const read = useCallback(async () => {
    const id = ++readId.current
    const result = await getAnalyticsOverview()
    if (id !== readId.current) return

    if (result.ok) {
      setOverview(result.value)
      setStatus('ready')
      return
    }

    // Charts already drawn stay drawn: see the module doc.
    setStatus(current => (current === 'ready' ? current : 'unavailable'))
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setStatus('loading')
        setOverview(null)
        return
      }

      void read()
      return () => {
        readId.current++
      }
    }, [signedIn, read]),
  )

  const refresh = useCallback(() => {
    if (!signedIn) return
    setRefreshing(true)
    void read().finally(() => setRefreshing(false))
  }, [signedIn, read])

  const charts = useMemo(
    () => (overview ? analyticsCharts(overview, supportAssignment) : []),
    [overview, supportAssignment],
  )
  const awaitingReply = overview?.snapshot.awaitingReply ?? null

  return { status, charts, awaitingReply, refreshing, refresh }
}
