import { useCallback, useEffect, useState } from 'react'

import type { MessageWallPost } from '@/lib/types'
import { getWallPost } from '@/lib/wall-api'
import { wallPostReferenceFromPost } from '@/lib/message-wall-post'

export type WallPostReplyDraft = {
  /** The Post waiting in the composer, or null for none. */
  wallPost: MessageWallPost | null
  /** Why the Post a Reply asked for is not waiting, or null. */
  notice: string | null
  /** The Post went out with a message, or the person left it out. */
  clear: () => void
  dismissNotice: () => void
}

/**
 * The Post a Reply to a Post (#77) opened this thread with, waiting in the
 * composer to go out as a card with the next message.
 *
 * Read once, from the API rather than handed across from the Wall: the route
 * param is all that survives a cold start or a deep link, and the card should
 * be drawn from the Post as it is now rather than as some other screen last
 * held it.
 *
 * Offered only in a thread of the Post's own organization. The API refuses any
 * other pairing (`wall_post_outside_conversation`), so a Post that arrives in
 * the wrong thread waits for nothing rather than for a send that will be turned
 * down. A Post that cannot be read any more says so once and is dropped.
 */
export function useWallPostReplyDraft(
  postId: string | undefined,
  conversationOrganizationId: string | null,
): WallPostReplyDraft {
  const [wallPost, setWallPost] = useState<MessageWallPost | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!postId || !conversationOrganizationId) return
    let cancelled = false

    void getWallPost(postId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        // An expired session is the auth layer's to say, as everywhere else.
        if (result.failure.kind === 'unauthorised') return
        setNotice(
          result.failure.kind === 'unreachable'
            ? 'No connection, so the post could not be attached.'
            : 'That post is no longer available.',
        )
        return
      }
      if (result.value.organizationId !== conversationOrganizationId) return
      setWallPost(wallPostReferenceFromPost(result.value))
    })

    return () => {
      cancelled = true
    }
  }, [postId, conversationOrganizationId])

  const clear = useCallback(() => setWallPost(null), [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  return { wallPost, notice, clear, dismissNotice }
}
