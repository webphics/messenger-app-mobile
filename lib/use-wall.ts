import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiFailure } from '@/lib/api-result'
import { listWallPosts, WALL_PAGE_LIMIT } from '@/lib/wall-api'
import {
  applyFirstPage,
  applyOlderPage,
  canPageBack,
  emptyWall,
  type WallPages,
} from '@/lib/wall-pages'
import { wallNotice, type WallNotice } from '@/lib/wall-notice'
import type { WallPost } from '@/lib/types'

/**
 * The default Wall: a page at a time, and what to say when there is nothing to
 * draw.
 *
 * The decisions are all somewhere else — `lib/wall-pages` for what a page does
 * to what is drawn and when the Wall has ended, `lib/wall-notice` for which of
 * the four things a screen with no Posts on it says. What is left here is the
 * part that is neither: when to ask, and how to ignore an answer that arrived
 * for a read somebody has already replaced.
 *
 * Nothing is persisted. A Wall is re-read from the API every time it is opened,
 * which is why a Session end has nothing of its own to destroy: the Posts live
 * in this state and go when the signed-in screens do, and the one thing that
 * does touch the disk — a document opened out of a Post — is downloaded by
 * `lib/attachment-cache` into the directory `session-wipe` already clears.
 * There is no Wall table, nothing under the app's document directory, and no
 * fourth thing for `endSessionOnDevice` to have been taught about.
 */

export type WallView = {
  /** What to draw: every Post read so far, newest first. */
  posts: WallPost[]
  /** What the screen says over them: loading, empty, failed, or one line. */
  notice: WallNotice
  loadingOlder: boolean
  refreshing: boolean
  /** Whether there is a page further back worth asking for. */
  canLoadOlder: boolean
  loadOlder: () => void
  refresh: () => void
  /**
   * Ask for the first page again, after one that did not arrive.
   *
   * Not `refresh`: that is a pull, and it reports itself through the control the
   * person pulled. This is a button on a Wall with nothing on it, and what it
   * has to show is the Wall loading — the state it left when the request failed.
   */
  retry: () => void
  /**
   * Put away a failure reported above Posts that are still drawn.
   *
   * Only that one: over a Wall with nothing to draw the failure is the whole
   * screen, and there is nothing underneath for putting it away to reveal.
   */
  dismissFailure: () => void
}

export function useWall(): WallView {
  const [read, setRead] = useState<WallPages>(emptyWall)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  /**
   * Which read the answer coming back belongs to.
   *
   * A refresh while a page is in flight wins, and the page it interrupted is
   * dropped rather than appended under rows it no longer sits below.
   */
  const generation = useRef(0)

  const loadFirst = useCallback(() => {
    const mine = (generation.current += 1)

    void listWallPosts().then(result => {
      if (generation.current !== mine) return
      setRefreshing(false)
      setLoading(false)

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      setRead(applyFirstPage(result.value, WALL_PAGE_LIMIT))
    })
  }, [])

  useEffect(() => {
    loadFirst()
    return () => {
      generation.current += 1
    }
  }, [loadFirst])

  const loadOlder = useCallback(() => {
    if (loadingOlder || !canPageBack(read)) return
    const mine = generation.current
    const cursor = read.cursor ?? undefined

    setLoadingOlder(true)
    void listWallPosts({ cursor }).then(result => {
      // Cleared before the generation is checked, and that order is the whole
      // of it: a refresh that superseded this page leaves nothing else to turn
      // the footer spinner off, and a flag nobody clears is a spinner that
      // never leaves and a `loadOlder` that returns early for the life of the
      // screen. `loadFirst` can guard first because the read that superseded it
      // clears the same two flags on the way past.
      setLoadingOlder(false)
      if (generation.current !== mine) return

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      setRead(current => applyOlderPage(current, result.value, WALL_PAGE_LIMIT))
    })
  }, [loadingOlder, read])

  const refresh = useCallback(() => {
    setRefreshing(true)
    loadFirst()
  }, [loadFirst])

  const retry = useCallback(() => {
    setFailure(null)
    setLoading(true)
    loadFirst()
  }, [loadFirst])

  const dismissFailure = useCallback(() => setFailure(null), [])

  return {
    posts: read.posts,
    notice: wallNotice({ drawn: read.posts.length, loading, failure }),
    loadingOlder,
    refreshing,
    canLoadOlder: canPageBack(read),
    loadOlder,
    refresh,
    retry,
    dismissFailure,
  }
}
