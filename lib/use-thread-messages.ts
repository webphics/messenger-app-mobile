import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { listMessages, sendMessage, type ApiFailure } from '@/lib/conversation-api'
import {
  applyMessagePage,
  applySentMessage,
  beginSend,
  deliveryStates,
  draftMessage,
  emptyThread,
  failSend,
  findUnsent,
  isLocalId,
  LOCAL_ID_PREFIX,
  threadMessages,
  withoutPages,
  type DeliveryState,
  type MessageAuthor,
  type SendDraft,
  type ThreadState,
} from '@/lib/conversation-state'
import type { Conversation, Message, UserRole } from '@/lib/types'

/**
 * One thread: its history a page at a time, and the messages typed into it.
 *
 * The decisions this makes are all in `lib/conversation-state`, which is where
 * they are tested: what a page does to the thread already held, how far back the
 * next one asks from, when there is nothing further back to ask for, and what
 * becomes of a message between the tap on send and the API's answer. What is
 * left here is the part that cannot be pure — when to ask, and how to ignore an
 * answer that arrived for a thread nobody is looking at any more.
 */

export type ThreadMessages = {
  /** What to render: the pages fetched, with anything still sending folded in. */
  messages: Message[]
  /** How far each unconfirmed message has got, by id. Empty for a settled thread. */
  delivery: ReadonlyMap<string, DeliveryState>
  /** True only for the first page: paging older has its own flag. */
  loading: boolean
  loadingOlder: boolean
  refreshing: boolean
  failure: ApiFailure | null
  loadOlder: () => void
  refresh: () => void
  /** Write a message to the thread. Answers nothing: the outcome arrives as state. */
  send: (draft: SendDraft) => void
  /** Send a failed message again, in place. */
  retrySend: (localId: string) => void
}

export function useThreadMessages(
  conversation: Conversation | null,
  role: UserRole,
  author: MessageAuthor | null = null,
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
  /**
   * The thread on screen right now.
   *
   * A send is guarded against this rather than against `generation`, which a
   * refresh bumps: an answer landing after a pull-to-refresh is still an answer
   * about a message the person can see, and dropping it would leave that message
   * marked as sending for good.
   */
  const onScreen = useRef<string | null>(null)
  /** Makes each local id unique when two sends share a millisecond. */
  const localSequence = useRef(0)
  /**
   * The local ids with a request out for them.
   *
   * Retry reads the rendered state, and two taps inside one frame both read the
   * same failed message — this is what stops the second from sending the body a
   * second time under a second server id.
   */
  const delivering = useRef(new Set<string>())
  /**
   * The current state, for the callbacks that must read it without being rebuilt
   * by it. Retry lives on a memoised bubble, and a callback that changed
   * identity on every page and every send would re-render every bubble in the
   * thread. Written after commit, which is always before anyone can tap.
   */
  const held = useRef(state)
  useEffect(() => {
    held.current = state
  }, [state])

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
      setState((thread) =>
        applyMessagePage(cursor ? thread : withoutPages(thread), page.value, {
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
    onScreen.current = conversationId

    if (!conversationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    void fetchPage(undefined, mine)

    return () => {
      generation.current += 1
      inFlight.current = false
      onScreen.current = null
      delivering.current.clear()
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

  /**
   * Carry one message to the API and record what came back.
   *
   * A reply to a message the server has never seen carries no
   * `replyToMessageId`: the API validates it as a UUID of a real row, and a
   * local id is neither. The reply still sends — losing the quote is a smaller
   * failure than refusing the message.
   */
  const deliver = useCallback(async (id: string, message: Message) => {
    if (delivering.current.has(message.id)) return
    delivering.current.add(message.id)

    setState((thread) => beginSend(thread, message))

    const quoted = message.replyTo?.id
    const sent = await sendMessage(id, {
      body: message.body,
      ...(quoted && !isLocalId(quoted) ? { replyToMessageId: quoted } : {}),
    })

    delivering.current.delete(message.id)
    if (onScreen.current !== id) return

    setState((thread) =>
      sent.ok
        ? applySentMessage(thread, message.id, sent.value)
        : failSend(thread, message.id),
    )
  }, [])

  const send = useCallback(
    (draft: SendDraft) => {
      // Both are guaranteed by the only screen that passes this on: it renders
      // no composer without a conversation and a signed-in person.
      if (!conversationId || !author) return
      const body = draft.body.trim()
      if (!body) return

      void deliver(
        conversationId,
        draftMessage({
          id: `${LOCAL_ID_PREFIX}${Date.now()}-${++localSequence.current}`,
          body,
          author,
          replyTo: draft.replyTo,
        }),
      )
    },
    [author, conversationId, deliver],
  )

  const retrySend = useCallback(
    (localId: string) => {
      if (!conversationId) return
      // From the ref rather than from inside a `setState` updater, which has to
      // be pure and this one would be starting a request.
      const unsent = findUnsent(held.current, localId)
      if (unsent) void deliver(conversationId, unsent.message)
    },
    [conversationId, deliver],
  )

  const messages = useMemo(() => threadMessages(state), [state])
  const delivery = useMemo(() => deliveryStates(state.unsent), [state.unsent])

  return {
    messages,
    delivery,
    loading,
    loadingOlder,
    refreshing,
    failure,
    loadOlder,
    refresh,
    send,
    retrySend,
  }
}
