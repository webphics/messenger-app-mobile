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
 * first page; clearing it is not, so a picker reopened with an empty box never
 * shows the last search's rows under it. An answer to a search that has since
 * changed is dropped.
 */

const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 40

export type GroupPages = {
  options: readonly AudienceOption[]
  status: 'loading' | 'ready' | 'failed'
  loadingMore: boolean
  /** The last next page failed; `loadMore` asks for it again. */
  moreFailed: boolean
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
  // Keyed like `held`, so a page asked for under an older search says nothing about this one.
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
  const [moreFailedKey, setMoreFailedKey] = useState<string | null>(null)
  const effective = search.trim() === '' ? '' : debounced.trim()
  const key = `${attempt}:${effective}`
  // The key of the answer the hook still wants; an answer for any other is dropped.
  const wanted = useRef(key)
  // The key a next page is in flight for. A ref, so two scrolls in one frame ask once.
  const inFlight = useRef<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    wanted.current = key
    if (!enabled) return
    void listGroupPage({ q: effective, limit: PAGE_SIZE }).then((result) => {
      if (wanted.current !== key) return
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
  }, [effective, enabled, key])

  const current = held?.key === key ? held : null
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const loadMore = useCallback(() => {
    if (!enabled || !current || current.status !== 'ready') return
    const after = current.nextCursor
    if (after === null || inFlight.current === key) return
    inFlight.current = key
    setLoadingMoreKey(key)
    setMoreFailedKey(null)
    void listGroupPage({ q: effective, limit: PAGE_SIZE, cursor: after }).then((result) => {
      if (inFlight.current === key) inFlight.current = null
      if (wanted.current !== key) return
      setLoadingMoreKey(null)
      if (!result.ok) {
        // A cursor the API no longer accepts cannot be retried; the list starts over instead.
        if (result.failure.kind === 'refused' && result.failure.code === 'invalid_conversation_cursor') {
          retry()
        } else {
          setMoreFailedKey(key)
        }
        return
      }
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
  }, [current, effective, enabled, key, retry])

  return {
    options: current?.options ?? [],
    status: current ? current.status : 'loading',
    loadingMore: current !== null && loadingMoreKey === key,
    moreFailed: current !== null && moreFailedKey === key,
    loadMore,
    retry,
  }
}
