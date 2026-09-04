import { useCallback, useEffect, useRef, useState } from 'react'

import {
  engageConversation,
  takeOverConversation,
  type ApiFailure,
} from '@/lib/conversation-api'
import { assignmentRefusal } from '@/lib/conversation-failure'
import type { ComposerAction } from '@/lib/composer-access'
import type { Conversation } from '@/lib/types'

/**
 * Claiming a thread, and taking one.
 *
 * Both are the same shape — one POST, one conversation back, one row folded into
 * the list every screen shares — so they are one hook with the action naming
 * which. Which action is *offered* is not decided here: `lib/composer-access`
 * mirrors the API's policy and answers that, and this carries out whatever came
 * back.
 *
 * Nothing is applied optimistically. Engage is the one action in the app that
 * genuinely races — two Agents can tap it on the same thread, and exactly one
 * wins — so showing the loser an open composer for the moment before the `409`
 * lands would be showing them a thread that was never theirs. The API's answer
 * is the whole truth about who holds it, and it arrives in well under the half
 * second a mutation is budgeted.
 */

export type ConversationAssignment = {
  /** Carry an offered action to the API. Answers nothing; the outcome arrives as state. */
  assign: (action: ComposerAction) => void
  /** True from the tap until the API answers. */
  assigning: boolean
  /**
   * Why the last attempt was refused, or null.
   *
   * Cleared when a new attempt starts and when the thread changes, because a
   * refusal is about one attempt on one conversation — `already_engaged` on the
   * thread somebody else took has nothing to say about the next one.
   */
  error: string | null
}

export function useConversationAssignment(
  conversationId: string | null,
  onAssigned: (conversation: Conversation) => void,
): ConversationAssignment {
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const assign = useCallback(
    (action: ComposerAction) => {
      const id = conversationId
      if (!id) return

      setAssigning(true)
      setError(null)

      void (async () => {
        const result =
          action.kind === 'engage'
            ? await engageConversation(id)
            : await takeOverConversation(id)

        if (onScreen.current !== id) return
        setAssigning(false)

        if (result.ok) {
          notify.current(result.value)
          return
        }
        setError(refusalFor(action, result.failure))
      })()
    },
    [conversationId],
  )

  return { assign, assigning, error }
}

/**
 * What to say when the API refused.
 *
 * An expired session says nothing here: the auth layer is already on its way to
 * sign-in, and a sentence about engaging would arrive on a screen that is
 * leaving.
 */
function refusalFor(action: ComposerAction, failure: ApiFailure): string | null {
  if (failure.kind === 'unauthorised') return null
  return assignmentRefusal(action.kind, failure)
}
