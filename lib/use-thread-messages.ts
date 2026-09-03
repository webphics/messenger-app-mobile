import { useCallback, useEffect, useRef, useState } from 'react'

import { listMessages, type ApiFailure } from '@/lib/conversation-api'
import { applyMessagePage, emptyThread, type ThreadState } from '@/lib/conversation-state'
import type { Conversation, UserRole } from '@/lib/types'

/**
 * One thread's history, a page at a time.
 *
 * The decisions this makes are all in `lib/conversation-state`, which is where
 * they are tested: what a page does to the thread already held, how far back the
 * next one asks from, and when there is nothing further back to ask for. What is
 * left here is the part that cannot be pure — when to ask, and how to ignore an
 * answer that arrived for a thread nobody is looking at any more.
 */

export type ThreadMessages = {
  state: ThreadState
  /** True only for the first page: paging older has its own flag. */
  loading: boolean
  loadingOlder: boolean
  refreshing: boolean
  failure: ApiFailure | null
  loadOlder: () => void
  refresh: () => void
}

export function useThreadMessages(
  conversation: Conversation | null,
  role: UserRole,
): ThreadMessages {
  const [state, setState] = useState<ThreadState>(emptyThread)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const conversationId = conversation?.id ?? null
  const conversationType = conversation?.type ?? null

  /** Which thread the answers coming back belong to, and which load of it. */
  const generation = useRef(0)
  /** One request at a time: `onEndReached` fires more than once per scroll. */
  const inFlight = useRef(false)

  const fetchPage = useCallback(
    async (cursor: string | undefined, mine: number) => {
      if (!conversationId || !conversationType) return
      if (inFlight.current) return
      inFlight.current = true

      const page = await listMessages(conversationId, cursor ? { cursor } : {})
      inFlight.current = false
      if (generation.current !== mine) return

      if (!page.ok) {
        setFailure(page.failure)
        setLoading(false)
        setLoadingOlder(false)
        setRefreshing(false)
        return
      }

      setFailure(null)
      setState((held) =>
        applyMessagePage(cursor ? held : emptyThread(), page.value, {
          role,
          conversationType,
        }),
      )
      setLoading(false)
      setLoadingOlder(false)
      setRefreshing(false)
    },
    [conversationId, conversationType, role],
  )

  useEffect(() => {
    const mine = ++generation.current
    setState(emptyThread())
    setFailure(null)

    if (!conversationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    void fetchPage(undefined, mine)

    return () => {
      generation.current += 1
      inFlight.current = false
    }
  }, [conversationId, fetchPage])

  const loadOlder = useCallback(() => {
    if (loading || loadingOlder || refreshing) return
    if (!state.hasMore || !state.cursor) return
    setLoadingOlder(true)
    void fetchPage(state.cursor, generation.current)
  }, [fetchPage, loading, loadingOlder, refreshing, state.cursor, state.hasMore])

  /** A refresh re-reads the newest page and rebuilds the thread from it. */
  const refresh = useCallback(() => {
    if (!conversationId) return
    const mine = ++generation.current
    inFlight.current = false
    setRefreshing(true)
    void fetchPage(undefined, mine)
  }, [conversationId, fetchPage])

  return { state, loading, loadingOlder, refreshing, failure, loadOlder, refresh }
}
