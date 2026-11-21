import { useCallback, useEffect, useRef, useState } from 'react'

import { appendPage, groupOption, type AudienceOption } from '@/lib/broadcast-audience'
import { listGroupPage } from '@/lib/conversation-api'
import type { Conversation } from '@/lib/types'

/**
 * The groups a Broadcast can go to, a page at a time, searched on the API.
 *
 * Not the inbox: an Admin's inbox is every conversation in the product and
 * changes with every socket event, and reading groups out of it is what made
 * the composer re-render, then freeze, on every keystroke (#25).
 *
 * Nothing is asked for until `enabled`, so the picker that owns this costs no
 * request until it is opened. A search is debounced and starts over from the
 * first page; an answer to a search that has since changed is dropped.
 */

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 40

export type GroupPages = {
  options: readonly AudienceOption[]
  status: 'loading' | 'ready' | 'failed'
  loadingMore: boolean
  loadMore: () => void
  retry: () => void
}

/** What the first page of one search, on one attempt, answered. */
type Held = {
  key: string
  status: 'ready' | 'failed'
  options: readonly AudienceOption[]
  nextCursor: string | null
}

const optionsOf = (rows: Conversation[]) => rows.flatMap((row) => groupOption(row) ?? [])

export function useGroupPages(enabled: boolean, search: string): GroupPages {
  const [debounced, setDebounced] = useState(search)
  const [attempt, setAttempt] = useState(0)
  const [held, setHeld] = useState<Held | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const key = `${attempt}:${debounced.trim()}`
  // The key of the answer the hook still wants; an answer for any other is dropped.
  const wanted = useRef(key)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    wanted.current = key
    if (!enabled) return
    void listGroupPage({ q: debounced, limit: PAGE_SIZE }).then((result) => {
      if (wanted.current !== key) return
      setLoadingMore(false)
      setHeld(
        result.ok
          ? {
              key,
              status: 'ready',
              options: appendPage([], optionsOf(result.value.items)),
              nextCursor: result.value.nextCursor,
            }
          : { key, status: 'failed', options: [], nextCursor: null },
      )
    })
  }, [debounced, enabled, key])

  const current = held?.key === key ? held : null

  const loadMore = useCallback(() => {
    if (!enabled || !current || current.status !== 'ready' || loadingMore) return
    const after = current.nextCursor
    if (after === null) return
    setLoadingMore(true)
    void listGroupPage({ q: debounced, limit: PAGE_SIZE, cursor: after }).then((result) => {
      if (wanted.current !== key) return
      setLoadingMore(false)
      // A page that failed leaves the cursor where it was, so the next scroll asks again.
      if (!result.ok) return
      setHeld((was) =>
        was && was.key === key
          ? {
              ...was,
              options: appendPage(was.options, optionsOf(result.value.items)),
              nextCursor: result.value.nextCursor,
            }
          : was,
      )
    })
  }, [current, debounced, enabled, key, loadingMore])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    options: current?.options ?? [],
    status: current ? current.status : 'loading',
    loadingMore: current !== null && loadingMore,
    loadMore,
    retry,
  }
}
