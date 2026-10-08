import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchMessageHistory } from '@/lib/conversation-api'
import type { MessageHistory } from '@/lib/types'

/**
 * Three answers rather than a list, as `MessageReceiptsState` has: a history
 * that failed to load must not read as a message nobody edited.
 */
export type MessageHistoryState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; history: MessageHistory }

/**
 * Every wording one message has had, fetched when somebody opens it rather than
 * with the thread: the API leaves history out of every page.
 */
export function useMessageHistory(
  conversationId: string | null,
  messageId: string | null,
  /**
   * The message's own `editedAt`, and the reason this needs no listener. An edit
   * arrives over the socket as the rewritten message, so a changed stamp is
   * exactly when this history has grown by a version.
   */
  editedAt?: string | null,
): { state: MessageHistoryState; reload: () => void } {
  const [state, setState] = useState<MessageHistoryState>({ status: 'loading' })
  // A reload that lands after the sheet has closed, or after the ids changed,
  // must not write over what replaced it.
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (!conversationId || !messageId) return
    const request = ++requestRef.current

    const result = await fetchMessageHistory(conversationId, messageId)
    if (request !== requestRef.current) return

    setState(result.ok ? { status: 'ready', history: result.value } : { status: 'failed' })
  }, [conversationId, messageId])

  useEffect(() => {
    // Not reset to `loading` when `editedAt` moves: the versions on screen are
    // still true, and the new one is added when the read answers.
    void load()
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter this effect owns, not a DOM node: the cleanup has to touch the current one.
      requestRef.current++
    }
  }, [load, editedAt])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers.
    setState({ status: 'loading' })
  }, [conversationId, messageId])

  const reload = useCallback(() => {
    void load()
  }, [load])

  return { state, reload }
}
