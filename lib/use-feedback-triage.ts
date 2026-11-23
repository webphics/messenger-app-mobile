import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

import { refusalSentence } from '@/lib/api-result'
import { listFeedback, readFeedbackSummary } from '@/lib/feedback-api'
import type { AdminFeedback, FeedbackSummary } from '@/lib/feedback-parse'
import type { FeedbackKindFilter, FeedbackTab } from '@/lib/feedback-rules'

const PAGE_SIZE = 30

/**
 * One tab of the super admin's feedback inbox: its rows and paging.
 *
 * Re-read when the tab or the kind filter changes, on a pull, and every time
 * the screen comes back into focus — the entry screen is where a triage is
 * saved, so returning from it is when the list may have changed.
 */
export type FeedbackInboxView = {
  rows: AdminFeedback[]
  total: number
  loading: boolean
  refreshing: boolean
  loadingMore: boolean
  failure: string | null
  refresh: () => void
  loadMore: () => void
}

export function useFeedbackInbox(state: FeedbackTab, kind: FeedbackKindFilter): FeedbackInboxView {
  const [rows, setRows] = useState<AdminFeedback[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const generation = useRef(0)
  const kindParam = kind === 'all' ? undefined : kind

  const loadFirst = useCallback(
    async (mode: 'first' | 'refresh' | 'quiet') => {
      const mine = (generation.current += 1)
      if (mode === 'refresh') setRefreshing(true)
      else if (mode === 'first') setLoading(true)
      const result = await listFeedback({ state, kind: kindParam, page: 1, pageSize: PAGE_SIZE })
      if (generation.current !== mine) return
      setLoading(false)
      setRefreshing(false)
      if (!result.ok) {
        setFailure(refusalSentence(result.failure, 'Bug reports and feedback could not be read.'))
        return
      }
      setFailure(null)
      setRows(result.value.rows)
      setTotal(result.value.total)
      setPage(1)
    },
    [kindParam, state],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers.
    setRows([])
    setTotal(0)
    void loadFirst('first')
  }, [loadFirst])

  // Coming back from an entry: re-read without a spinner over rows already drawn.
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true
        return
      }
      void loadFirst('quiet')
    }, [loadFirst]),
  )

  const refresh = useCallback(() => void loadFirst('refresh'), [loadFirst])

  const loadMore = useCallback(() => {
    if (loadingMore || loading || rows.length >= total) return
    const mine = generation.current
    setLoadingMore(true)
    void listFeedback({ state, kind: kindParam, page: page + 1, pageSize: PAGE_SIZE }).then(result => {
      setLoadingMore(false)
      if (generation.current !== mine || !result.ok) return
      setRows(current => {
        const seen = new Set(current.map(row => row.id))
        return [...current, ...result.value.rows.filter(row => !seen.has(row.id))]
      })
      setTotal(result.value.total)
      setPage(page + 1)
    })
  }, [kindParam, loading, loadingMore, page, rows.length, state, total])

  return { rows, total, loading, refreshing, loadingMore, failure, refresh, loadMore }
}

/** The counts on the Hub row and above the inbox, re-read whenever either comes into focus. */
export function useFeedbackSummary(enabled: boolean): FeedbackSummary | null {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let live = true
      void readFeedbackSummary().then(result => {
        if (live && result.ok) setSummary(result.value)
      })
      return () => {
        live = false
      }
    }, [enabled]),
  )

  return enabled ? summary : null
}
