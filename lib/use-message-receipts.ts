import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchMessageReceipts } from '@/lib/conversation-api'
import type { MessageReceipts } from '@/lib/types'

/**
 * Three answers rather than a list, for the reason `NotesState` has three: "No
 * one has read this yet" is a claim about the message, and making it while the
 * fetch has failed tells somebody their message has gone unread when it may have
 * been read by everyone. One of those is worth a retry and the other is not.
 */
export type MessageReceiptsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; receipts: MessageReceipts }

/**
 * Who has read one message, and when.
 *
 * The API answers 403 for a message this person did not send, so the caller
 * gates the way in rather than this handling a refusal it should never receive —
 * a 403 here lands in `failed` with everything else, which is the honest place
 * for a request that should not have been made.
 */
export function useMessageReceipts(
  conversationId: string | null,
  messageId: string | null,
): { state: MessageReceiptsState; reload: () => void } {
  const [state, setState] = useState<MessageReceiptsState>({ status: 'loading' })
  // A reload that lands after the screen has gone, or after the ids changed,
  // must not write over what replaced it.
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (!conversationId || !messageId) return
    const request = ++requestRef.current

    const result = await fetchMessageReceipts(conversationId, messageId)
    if (request !== requestRef.current) return

    setState(
      result.ok ? { status: 'ready', receipts: result.value } : { status: 'failed' },
    )
  }, [conversationId, messageId])

  useEffect(() => {
    setState({ status: 'loading' })
    void load()
    return () => {
      requestRef.current++
    }
  }, [load])

  const reload = useCallback(() => {
    void load()
  }, [load])

  return { state, reload }
}
