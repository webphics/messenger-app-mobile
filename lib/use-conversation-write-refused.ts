import { useCallback, useEffect, useRef } from 'react'

import type { ApiFailure, ApiResult } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import { getConversation } from '@/lib/conversation-api'
import { refusedWriteFollowUp } from '@/lib/conversation-failure'
import { useConversationInbox } from '@/lib/conversation-inbox'
import { useSupportAssignment } from '@/lib/use-support-assignment'
import type { Conversation } from '@/lib/types'

/**
 * What every conversation write path calls when the API refuses the write.
 *
 * Send, react, edit, upload, engage, take over, transfer, close, reopen, a
 * label change and a note all end here on failure. What to do is
 * `refusedWriteFollowUp` in `lib/conversation-failure`, a pure answer with
 * tests beside it; this carries it out:
 *
 * - When the copy is stale, the conversation is fetched again and folded into
 *   the shared list through `addConversation`, the path a get-or-create
 *   already takes. The fresh row carries this viewer's `access`, so the
 *   composer, the way out and the thread actions move to the new state on
 *   every screen that reads the list. Nothing renders from the answer
 *   directly (ADR-0008).
 * - When the Shared queue switch moved, the session is read again, which is
 *   what moves the screens between the two modes without a restart.
 *
 * Both happen whether or not the person is still on the thread: the list and
 * the session are shared, and they are stale wherever the person has gone.
 *
 * The answer is the refetch's result, or null when there was none, for the one
 * caller that reads it: a Reopen refused with `conversation_not_closed` shows
 * nothing when the fresh copy arrives, since it is already open.
 *
 * This is not ADR-0008's re-read before Engage and Takeover. That one runs
 * before the write, to stop a lost race from firing at all, and stays in
 * `useConversationAssignment`.
 */
export type ConversationWriteRefused = (
  conversationId: string,
  failure: ApiFailure,
) => Promise<ApiResult<Conversation> | null>

export function useConversationWriteRefused(): ConversationWriteRefused {
  const { reconfirmSession } = useAuth()
  const supportAssignment = useSupportAssignment()
  const { addConversation } = useConversationInbox()

  /**
   * Held so the callback keeps one identity: the write paths that call it sit
   * behind memoised bubbles, and the switch and the list move under them.
   */
  const held = useRef({ supportAssignment, reconfirmSession, addConversation })
  useEffect(() => {
    held.current = { supportAssignment, reconfirmSession, addConversation }
  }, [supportAssignment, reconfirmSession, addConversation])

  return useCallback(async (conversationId: string, failure: ApiFailure) => {
    const { supportAssignment: enabled, reconfirmSession: reconfirm } = held.current
    const followUp = refusedWriteFollowUp(failure, enabled)
    if (followUp.reconfirmSession) reconfirm()
    if (!followUp.refetch) return null

    const fresh = await getConversation(conversationId)
    if (fresh.ok) held.current.addConversation(fresh.value)
    return fresh
  }, [])
}
