import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

import { useAuth } from '@/lib/auth-context'
import { listWallPosts } from '@/lib/wall-api'
import type { WallPost } from '@/lib/types'

/**
 * The newest few Posts on the viewer's Wall, for the Hub — and nothing else.
 *
 * Deliberately not `lib/use-wall`. That hook is the Wall tab: paging back
 * through it, a sort choice kept on disk, a socket subscription and five
 * optimistic actions on a Post. The Hub shows the top of the Wall and offers a
 * way into it; it cannot page, cannot sort, and nothing on it acts on a Post,
 * so borrowing that hook would mount all of it on the one screen a launch
 * already lands on.
 *
 * It does mean the Hub reads the Wall, which is a request the Hub never used to
 * make — the section it replaced was drawn from an in-memory catalogue. That is
 * the cost of the section being real, and it is one read of one page.
 *
 * Read on focus rather than once on mount: a tab is mounted for the life of the
 * session, so a Hub that only ever asked at launch would show the newest Posts
 * as of launch for the rest of the day. There is no socket here for the same
 * reason there is no paging — the Wall tab is where a Post is watched live.
 *
 * Three states, and no fourth for "the read failed after Posts were already
 * drawn": a Hub is not where a failed request is explained. What is on screen is
 * still true, so a refused or unreachable refresh leaves it alone and the Wall
 * tab — which has a retry, a notice and somewhere to put them — is where a
 * reader finds out. Only a failure with nothing drawn yet becomes
 * `unavailable`, and the Hub answers that by drawing no section at all, exactly
 * as it already does for a Recent message it could not fetch.
 */

/** How many Posts the Hub asks for. A carousel, not a feed — enough to swipe, not to read. */
export const WALL_HIGHLIGHT_COUNT = 5

export type WallHighlights =
  | { status: 'loading' }
  | { status: 'ready'; posts: WallPost[] }
  | { status: 'unavailable' }

export function useWallHighlights(): WallHighlights {
  const { state } = useAuth()
  const signedIn = state.status === 'signed-in'

  const [highlights, setHighlights] = useState<WallHighlights>({ status: 'loading' })

  /**
   * Which read is the current one. A focus that arrives while an earlier read is
   * still in flight must not be overwritten by the answer to that earlier one —
   * the same guard `lib/use-wall` keeps, for the same reason. Bumping it on
   * cleanup is also what keeps an answer from landing on a signed-out Hub.
   */
  const readId = useRef(0)

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setHighlights({ status: 'loading' })
        return
      }

      const id = ++readId.current

      void listWallPosts({ limit: WALL_HIGHLIGHT_COUNT }).then(result => {
        if (id !== readId.current) return

        if (result.ok) {
          setHighlights({ status: 'ready', posts: result.value })
          return
        }

        // A refresh that failed over Posts already on screen keeps them: see the
        // module doc. Only a first read with nothing behind it becomes a state.
        setHighlights(current =>
          current.status === 'ready' ? current : { status: 'unavailable' },
        )
      })

      return () => {
        readId.current++
      }
    }, [signedIn]),
  )

  return highlights
}
