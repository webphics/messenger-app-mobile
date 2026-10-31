import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

import { refusalSentence, type ApiResult } from '@/lib/api-result'
import { listReports, readReportSummary, resolveReport } from '@/lib/report-api'
import type { AdminReport, ReportAction, ReportStatus, ReportSummary } from '@/lib/report-parse'
import { withResolvedReport } from '@/lib/report-queue'

const PAGE_SIZE = 30

/**
 * One tab of the Admin's report queue: its rows, paging, and the three actions.
 *
 * Re-read whenever the tab changes, on a pull, and after an action, which also
 * re-reads the summary — the Hub's count is the number somebody is held to.
 */
export type ReportQueueView = {
  rows: AdminReport[]
  total: number
  /** When the rows were last read, which is the clock their ages and *Overdue* are judged by. */
  readAt: number
  loading: boolean
  refreshing: boolean
  loadingMore: boolean
  failure: string | null
  refresh: () => void
  loadMore: () => void
  /** Ids with an action in flight, so their buttons wait. */
  busy: ReadonlySet<string>
  resolve: (report: AdminReport, action: ReportAction) => Promise<ApiResult<AdminReport>>
}

export function useReportQueue(status: ReportStatus): ReportQueueView {
  const [rows, setRows] = useState<AdminReport[]>([])
  const [total, setTotal] = useState(0)
  const [readAt, setReadAt] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const generation = useRef(0)

  const loadFirst = useCallback(
    async (mode: 'first' | 'refresh') => {
      const mine = (generation.current += 1)
      if (mode === 'refresh') setRefreshing(true)
      else setLoading(true)
      const result = await listReports({ status, page: 1, pageSize: PAGE_SIZE })
      if (generation.current !== mine) return
      setLoading(false)
      setRefreshing(false)
      if (!result.ok) {
        setFailure(refusalSentence(result.failure, 'Reports could not be read.'))
        return
      }
      setFailure(null)
      setReadAt(Date.now())
      setRows(result.value.rows)
      setTotal(result.value.total)
      setPage(1)
    },
    [status],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
    setRows([])
    setTotal(0)
    void loadFirst('first')
  }, [loadFirst])

  const refresh = useCallback(() => void loadFirst('refresh'), [loadFirst])

  const loadMore = useCallback(() => {
    if (loadingMore || loading || rows.length >= total) return
    const mine = generation.current
    setLoadingMore(true)
    void listReports({ status, page: page + 1, pageSize: PAGE_SIZE }).then(result => {
      setLoadingMore(false)
      if (generation.current !== mine || !result.ok) return
      setRows(current => {
        const seen = new Set(current.map(row => row.id))
        return [...current, ...result.value.rows.filter(row => !seen.has(row.id))]
      })
      setTotal(result.value.total)
      setPage(page + 1)
    })
  }, [loading, loadingMore, page, rows.length, status, total])

  const resolve = useCallback(
    async (report: AdminReport, action: ReportAction) => {
      setBusy(current => new Set(current).add(report.id))
      const result = await resolveReport(report.id, action)
      setBusy(current => {
        const next = new Set(current)
        next.delete(report.id)
        return next
      })
      if (result.ok) {
        // Resolving one report closes every open report on the same target, so
        // the tab is re-read rather than patched one row at a time.
        setRows(current => withResolvedReport(current, result.value, status))
        void loadFirst('refresh')
      }
      return result
    },
    [loadFirst, status],
  )

  return { rows, total, readAt, loading, refreshing, loadingMore, failure, refresh, loadMore, busy, resolve }
}

/**
 * The Hub row's count: open reports and how many are past the day App Review
 * allows. Read every time the Hub comes into focus, so coming back from the
 * queue shows what acting on it changed.
 */
export function useReportSummary(enabled: boolean): ReportSummary | null {
  const [summary, setSummary] = useState<ReportSummary | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let live = true
      void readReportSummary().then(result => {
        if (live && result.ok) setSummary(result.value)
      })
      return () => {
        live = false
      }
    }, [enabled]),
  )

  return enabled ? summary : null
}
