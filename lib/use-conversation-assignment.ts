import { useCallback, useEffect, useRef, useState } from 'react'

import {
  engageConversation,
  getConversation,
  reopenConversation,
  takeOverConversation,
} from '@/lib/conversation-api'
import { assignmentPrecheck } from '@/lib/assignment-precheck'
import { useAuth } from '@/lib/auth-context'
import { assignmentModeChanged, assignmentRefusal } from '@/lib/conversation-failure'
import type { ComposerAction } from '@/lib/composer-access'
import type { Conversation } from '@/lib/types'

/**
 * Engaging a thread, and taking one over.
 *
 * Both are the same shape — one re-read, one POST, one conversation back, one
 * row folded into the list every screen shares — so they are one hook with the
 * action naming which. Which action is *offered* is not decided here:
 * `lib/composer-access` mirrors the API's policy and answers that, and this
 * carries out whatever came back.
 *
 * Neither fires against the row on screen. That row is old between any two
 * fetches, and the Store can restore one older still, so both actions re-read
 * the conversation from the API first and `lib/assignment-precheck` reads the
 * answer. This is the carve-out ADR-0008 names: every other read and every send
 * tolerates being a few seconds behind, and claiming a thread somebody else is
 * already answering does not.
 *
 * What the re-read said replaces what was held, whichever way it goes. That is
 * what takes a claimed thread out of the Unassigned pool without refetching the
 * list, and it is worth doing on the way to a successful Engage too: the pool is
 * a filter over the same rows, so correcting one corrects every screen holding
 * it.
 *
 * Nothing is applied optimistically. Engage is the one action in the app that
 * genuinely races — two Agents can tap it on the same thread, and exactly one
 * wins — so showing the loser an open composer for the moment before the answer
 * lands would be showing them a thread that was never theirs. The API's answer
 * is the whole truth about who holds it.
 *
 * The cost is a second round trip on the one path in the app that has a budget
 * to spend it from: a GET on the connection the POST is about to use, in front
 * of a mutation nobody makes twice a minute. It is spent deliberately, and it
 * is the reason the button holds its spinner slightly longer than it used to.
 */

export type ConversationAssignment = {
  /** Carry an offered action to the API. Answers nothing; the outcome arrives as state. */
  assign: (action: ComposerAction) => void
  /** True from the tap until the API answers — the re-read included. */
  assigning: boolean
  /**
   * Why the last attempt was refused, or null.
   *
   * Three things end up here and each reads as itself: a lost race names whoever
   * holds the thread now, a refusal repeats what the API said, and a re-read
   * that never arrived asks about the connection rather than blaming a rival who
   * may not exist.
   *
   * Cleared when a new attempt starts and when the thread changes, because a
   * refusal is about one attempt on one conversation — `already_engaged` on the
   * thread somebody else took has nothing to say about the next one.
   */
  error: string | null
}

/**
 * `viewerId` is what the re-read is read against: the one thing the answer
 * cannot say by itself is whether the person holding the thread is the person
 * looking at it. Nullable alongside `conversationId`, because both are absent on
 * a screen with no thread open, and neither absence is worth a second shape.
 */
export function useConversationAssignment(
  conversationId: string | null,
  viewerId: string | null,
  onAssigned: (conversation: Conversation) => void,
): ConversationAssignment {
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { reconfirmSession } = useAuth()

  /**
   * Which thread the answer coming back belongs to. An engage answered after the
   * person has walked out of the thread must not fold a row in behind them, and
   * must not leave the next thread they open showing a spinner.
   */
  const onScreen = useRef<string | null>(conversationId)
  useEffect(() => {
    onScreen.current = conversationId
    setAssigning(false)
    setError(null)

    return () => {
      onScreen.current = null
    }
  }, [conversationId])

  /**
   * Held so the callback below can read it without being rebuilt by it: the
   * button that calls this sits beside a thread of memoised bubbles.
   */
  const notify = useRef(onAssigned)
  useEffect(() => {
    notify.current = onAssigned
  }, [onAssigned])

  /**
   * Reopen skips the re-read Engage and Takeover make first. Those guard a race
   * over who holds the thread; a reopen has only one race, somebody reopening
   * it first, and the API answers that one itself with `conversation_not_closed`.
   * On that answer the thread is re-read, because it is already in the state the
   * person asked for and the composer should open rather than show a refusal.
   */
  const reopen = useCallback(async (id: string) => {
    const result = await reopenConversation(id)
    if (onScreen.current !== id) return

    if (result.ok) {
      setAssigning(false)
      notify.current(result.value)
      return
    }

    if (result.failure.kind === 'refused' && result.failure.code === 'conversation_not_closed') {
      const fresh = await getConversation(id)
      if (onScreen.current !== id) return
      setAssigning(false)
      if (fresh.ok) notify.current(fresh.value)
      else setError(assignmentRefusal(fresh.failure))
      return
    }

    setAssigning(false)
    setError(assignmentRefusal(result.failure))
  }, [])

  const assign = useCallback(
    (action: ComposerAction) => {
      const id = conversationId
      if (!id) return

      setAssigning(true)
      setError(null)

      if (action.kind === 'reopen') {
        void reopen(id)
        return
      }
      const kind = action.kind

      void (async () => {
        const fresh = await getConversation(id)
        if (onScreen.current !== id) return

        if (!fresh.ok) {
          /*
           * The action never happened and this does not know why the thread
           * looks the way it does, so the row on screen is left alone and the
           * failure is reported as the transport failure it is.
           */
          setAssigning(false)
          setError(assignmentRefusal(fresh.failure))
          return
        }

        notify.current(fresh.value)

        const verdict = assignmentPrecheck(kind, fresh.value, { id: viewerId })
        if (verdict.kind === 'stop') {
          setAssigning(false)
          setError(verdict.message)
          return
        }

        const result =
          kind === 'engage'
            ? await engageConversation(id)
            : await takeOverConversation(id)

        // The button was offered by a session that did not know the switch
        // moved. Re-reading it is what takes the button away and opens the
        // composer — before the on-screen check, because the session is out of
        // date wherever the person has gone since.
        // `true`: Engage and Takeover are only offered while assignment is on.
        if (!result.ok && assignmentModeChanged(result.failure, true)) reconfirmSession()

        if (onScreen.current !== id) return
        setAssigning(false)

        if (result.ok) {
          notify.current(result.value)
          return
        }
        setError(assignmentRefusal(result.failure))
      })()
    },
    [conversationId, viewerId, reconfirmSession, reopen],
  )

  return { assign, assigning, error }
}
