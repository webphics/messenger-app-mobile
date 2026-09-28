import { useCallback, useEffect, useRef, useState } from 'react'

import { listActivity } from '@/lib/activity-api'
import { failureNotice } from '@/lib/conversation-failure'
import type { ActivityEvent } from '@/lib/types'

/**
 * The team's Activity feed, loaded a page at a time.
 *
 * Shaped like `use-user-directory`: the search is debounced and sent to the
 * API rather than applied here, because the feed is the whole team's history
 * and a phone has no business narrowing it for itself. Unlike the directory it
 * pages — the feed only grows — and a page is appended when the list reaches
 * its end.
 *
 * A failed next page leaves the rows already drawn where they are and says so
 * beneath them: what is drawn is still true, and replacing it with a failure
 * screen because the page after it did not arrive is the wrong way round.
 */

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 30

export type ActivityFeed =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | {
      status: 'ready'
      events: ActivityEvent[]
      /** Whether the API holds rows past the ones drawn. */
      hasMore: boolean
    }

export type ActivityListView = {
  feed: ActivityFeed
  /** What the search field holds, which is ahead of what has been asked for. */
  query: string
  setQuery: (query: string) => void
  reload: () => void
  refreshing: boolean
  refresh: () => void
  /** True while the next page is out. */
  loadingMore: boolean
  /** Why the last next page did not arrive, or null. */
  moreFailure: string | null
  loadMore: () => void
}

export function useActivityList(): ActivityListView {
  const [feed, setFeed] = useState<ActivityFeed>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailure, setMoreFailure] = useState<string | null>(null)

  /** Which load the answer coming back belongs to. A search changed mid-flight wins. */
  const generation = useRef(0)
  /** The last page drawn, which is what the next one follows. */
  const page = useRef(1)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(() => {
    const mine = (generation.current += 1)
    void listActivity({ search: debounced, page: 1, pageSize: PAGE_SIZE }).then((result) => {
      if (generation.current !== mine) return
      setRefreshing(false)
      // A next page still out when this load began was for the list this replaces.
      setLoadingMore(false)
      setMoreFailure(null)
      if (result.ok) {
        page.current = 1
        setFeed({
          status: 'ready',
          events: result.value.events,
          hasMore: result.value.events.length < result.value.total,
        })
        return
      }
      const notice = failureNotice(result.failure, 'Could not load activity')
      setFeed({ status: 'failed', title: notice.title, hint: notice.hint })
    })
  }, [debounced])

  useEffect(() => {
    load()
    return () => {
      generation.current += 1
    }
  }, [load])

  const reload = useCallback(() => {
    setFeed({ status: 'loading' })
    load()
  }, [load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const loadMore = useCallback(() => {
    if (feed.status !== 'ready' || !feed.hasMore || loadingMore) return
    const mine = generation.current
    const next = page.current + 1
    setLoadingMore(true)
    setMoreFailure(null)

    void listActivity({ search: debounced, page: next, pageSize: PAGE_SIZE }).then((result) => {
      // A search or a refresh started since: this page belongs to a list that is gone.
      if (generation.current !== mine) return
      setLoadingMore(false)
      if (!result.ok) {
        setMoreFailure(failureNotice(result.failure, 'Could not load more activity').hint)
        return
      }
      page.current = next
      setFeed((held) => {
        if (held.status !== 'ready') return held
        // Something recorded since the first page pushes older rows down a
        // page, so the next one can repeat a row already drawn.
        const seen = new Set(held.events.map((row) => row.id))
        const events = [...held.events, ...result.value.events.filter((row) => !seen.has(row.id))]
        return {
          status: 'ready',
          events,
          hasMore: result.value.events.length > 0 && events.length < result.value.total,
        }
      })
    })
  }, [debounced, feed, loadingMore])

  return {
    feed,
    query,
    setQuery,
    reload,
    refreshing,
    refresh,
    loadingMore,
    moreFailure,
    loadMore,
  }
}
