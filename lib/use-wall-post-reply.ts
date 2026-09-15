import { useCallback, useRef, useState } from 'react'

import type { ApiFailure } from '@/lib/api-result'
import { ensureSupportConversation } from '@/lib/conversation-api'
import { useConversationInbox } from '@/lib/conversation-inbox'
import type { WallPost } from '@/lib/types'

/**
 * Reply on a Post (#77): open the viewer's own support conversation with the
 * Post's organization, creating it the same get-or-create way a first visit
 * to Messages does.
 *
 * This hook fetches and hands back an id; it never navigates. That line is
 * drawn the same way everywhere else in this app — `lib/use-thread-management`,
 * `lib/use-conversation-assignment` — a hook reports what the API said, and the
 * screen holding the router decides what to do with it.
 *
 * Nothing here writes anything to the Post: no relation, no reply count, and
 * the conversation this opens is never the Post's author's — it is the
 * organization's support thread, the same one Messages would have created on
 * this person's first visit there.
 */

export type WallPostReply = {
  /** The Post a reply is in flight for, or null. */
  pending: string | null
  /** Why the last attempt was refused, or null. Cleared when the next one starts. */
  error: string | null
  dismissError: () => void
  /** Opens (or creates) the conversation and hands back its id, or null on refusal. */
  reply: (post: WallPost) => Promise<string | null>
}

/**
 * An expired session says nothing, the convention every write in this app
 * follows: the auth layer is already on its way to sign-in, and a sentence
 * about a reply would arrive on a screen that is leaving.
 */
function refusal(failure: ApiFailure): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return 'That could not be opened.'
}

export function useWallPostReply(): WallPostReply {
  const { addConversation } = useConversationInbox()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Which Post the answer coming back belongs to, so a stale one is ignored. */
  const inFlight = useRef<string | null>(null)

  const reply = useCallback(
    async (post: WallPost) => {
      inFlight.current = post.id
      setPending(post.id)
      setError(null)

      const result = await ensureSupportConversation(post.organizationId)
      if (inFlight.current !== post.id) return null
      setPending(null)

      if (!result.ok) {
        setError(refusal(result.failure))
        return null
      }

      addConversation(result.value)
      return result.value.id
    },
    [addConversation],
  )

  const dismissError = useCallback(() => setError(null), [])

  return { pending, error, dismissError, reply }
}
