import { useCallback, useEffect, useRef, useState } from 'react'

import {
  closeConversation,
  reopenConversation,
  listStaffDirectory,
  transferConversation,
} from '@/lib/conversation-api'
import type { ApiFailure } from '@/lib/api-result'
import { assignmentModeChanged, assignmentRefusal } from '@/lib/conversation-failure'
import { useConversationWriteRefused } from '@/lib/use-conversation-write-refused'
import { transferCandidates } from '@/lib/thread-actions'
import type { Conversation, StaffDirectoryUser } from '@/lib/types'

/**
 * Ending a thread, and handing it on.
 *
 * Transfer, Close and Reopen, held together because they are the same shape:
 * one POST, one conversation back, one row folded into the list every screen
 * shares. Which of them is offered at all is the conversation's `access`, read
 * through `threadActionsView` in `lib/conversation-access`, so an Agent with
 * the Transfer Capability and not the Close one is offered one and not the
 * other. This only carries out what came back.
 *
 * Unlike Engage and Takeover, neither re-reads the thread first. That carve-out
 * exists for the one surface several staff compete over the same rows on — the
 * Unassigned pool — and these are the opposite case: a thread this person is
 * already holding, which nobody else can close or transfer out from under them.
 * The API is still the authority, and a refusal is shown as its own sentence.
 * Every refusal also goes to `useConversationWriteRefused`, which fetches the
 * thread again when the refusal says this copy is stale (somebody closed or
 * reopened it first, or a Capability was revoked) and re-reads the session when
 * the Shared queue switch moved.
 *
 * The transfer directory is fetched only when somebody asks for it. It is the
 * staff directory, narrowed to the Agents a transfer may legally go to, and a
 * thread is transferred a handful of times in its life — paying for that list
 * on the way into every details screen would be a request almost nobody wanted.
 */

export type ThreadManagement = {
  /** Ask for the list of Agents this thread may go to. Idempotent. */
  loadCandidates: () => void
  candidates: StaffDirectoryUser[] | null
  candidatesFailed: boolean
  transfer: (agentId: string) => void
  /**
   * Close with a summary of the support given. Answers the refusal to show, or
   * null when it landed, so the sheet the summary was written in can stay open
   * with the draft rather than lose it.
   */
  close: (summary: string) => Promise<string | null>
  /** Reopen a closed thread. No sheet: there is nothing to collect. */
  reopen: () => void
  /** Which action has a request out, so its control can say it is working. */
  pending: 'transfer' | 'close' | 'reopen' | null
  /** Why the last attempt was refused, or null. Cleared when the next one starts. */
  error: string | null
}

/**
 * An expired session says nothing, the same convention the rest of this app
 * follows: the auth layer is already on its way to sign-in, and a sentence
 * about a transfer would arrive on a screen that is leaving.
 */
function refusal(failure: ApiFailure, fallback: string): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return fallback
}

export function useThreadManagement(
  conversationId: string | null,
  conversation: Conversation | null,
  onChanged: (conversation: Conversation) => void,
): ThreadManagement {
  const [candidates, setCandidates] = useState<StaffDirectoryUser[] | null>(null)
  const [candidatesFailed, setCandidatesFailed] = useState(false)
  const [pending, setPending] = useState<'transfer' | 'close' | 'reopen' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const writeRefused = useConversationWriteRefused()

  /** Which thread the answers coming back belong to. */
  const onScreen = useRef<string | null>(conversationId)
  useEffect(() => {
    onScreen.current = conversationId
    return () => {
      onScreen.current = null
    }
  }, [conversationId])

  /** Held so the callbacks below can read it without being rebuilt by it. */
  const notify = useRef(onChanged)
  useEffect(() => {
    notify.current = onChanged
  }, [onChanged])

  /**
   * The thread as of this render, for narrowing the directory. Read through a
   * ref because a transfer list opened before a socket event lands should
   * narrow against the row that is current when it is *used*, not when the
   * callback was built.
   */
  const held = useRef(conversation)
  useEffect(() => {
    held.current = conversation
  }, [conversation])

  const asked = useRef(false)
  const loadCandidates = useCallback(() => {
    if (asked.current) return
    asked.current = true
    setCandidatesFailed(false)

    void listStaffDirectory().then((result) => {
      if (!result.ok) {
        // Askable again: a directory that never arrived is worth a second tap,
        // unlike one that arrived empty.
        asked.current = false
        setCandidatesFailed(true)
        return
      }
      const thread = held.current
      setCandidates(thread ? transferCandidates(result.value, thread) : result.value)
    })
  }, [])

  const transfer = useCallback((agentId: string) => {
    const id = onScreen.current
    if (!id) return

    setPending('transfer')
    setError(null)

    void transferConversation(id, agentId).then((result) => {
      // A Transfer is refused like an Engage when assignment went off under
      // this session, and that refusal gets the Engage wording.
      // `true`: Transfer is only offered while assignment is on.
      const switchedOff = !result.ok && assignmentModeChanged(result.failure, true)
      // Before the on-screen check, because the list and the session are
      // stale wherever the person went.
      if (!result.ok) void writeRefused(id, result.failure)

      if (onScreen.current !== id) return
      setPending(null)
      if (result.ok) {
        notify.current(result.value)
        return
      }
      setError(
        switchedOff
          ? assignmentRefusal(result.failure)
          : refusal(result.failure, 'The conversation could not be transferred.'),
      )
    })
  }, [writeRefused])

  const close = useCallback(async (summary: string): Promise<string | null> => {
    const id = onScreen.current
    if (!id) return null

    setPending('close')
    setError(null)

    const result = await closeConversation(id, summary)
    if (!result.ok) void writeRefused(id, result.failure)
    if (onScreen.current !== id) return null
    setPending(null)
    if (result.ok) {
      notify.current(result.value)
      return null
    }
    return refusal(result.failure, 'The conversation could not be closed.')
  }, [writeRefused])

  const reopen = useCallback(() => {
    const id = onScreen.current
    if (!id) return

    setPending('reopen')
    setError(null)

    void reopenConversation(id).then((result) => {
      if (!result.ok) void writeRefused(id, result.failure)
      if (onScreen.current !== id) return
      setPending(null)
      if (result.ok) {
        notify.current(result.value)
        return
      }
      setError(
        result.failure.kind === 'refused' && result.failure.code === 'conversation_not_closed'
          ? 'This conversation is already open.'
          : refusal(result.failure, 'The conversation could not be reopened.'),
      )
    })
  }, [writeRefused])

  return { loadCandidates, candidates, candidatesFailed, transfer, close, reopen, pending, error }
}
