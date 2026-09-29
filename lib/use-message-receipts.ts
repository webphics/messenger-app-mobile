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
  /**
   * The message's own receipt status, and the reason this needs no timer.
   *
   * Receipts move while somebody is looking at them — a thread is opened and a
   * name appears — but there is no per-message receipt event to listen for. What
   * there is is the message itself, rebroadcast over the socket when its status
   * changes, which is exactly when these lists have changed. Passing it in makes
   * that the trigger: sent to delivered to read each re-reads, and nothing polls.
   */
  status?: string,
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
    // Not reset to `loading` on a status change: the lists on screen are still
    // true, and blanking them to a spinner every time a receipt lands would make
    // the one message that states its time flicker.
    void load()
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter/set this effect owns, not a DOM node: the cleanup has to touch the current one.
      requestRef.current++
    }
  }, [load, status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
    setState({ status: 'loading' })
  }, [conversationId, messageId])

  const reload = useCallback(() => {
    void load()
  }, [load])

  return { state, reload }
}
