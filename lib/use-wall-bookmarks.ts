import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiFailure, ApiResult } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import {
  nextWallPostVote,
  toggleWallPostReaction,
  withVoteDelta,
  type WallPostViewer,
} from '@/lib/wall-actions'
import { shouldRecordWallPostView } from '@/lib/wall-card'
import {
  listWallBookmarks,
  reactToWallPost,
  recordWallPostView,
  removeWallPost,
  toggleWallPostBookmark,
  updateWallPost,
  voteOnWallPost,
  WALL_BOOKMARKS_PAGE_LIMIT,
  type WallPostEditInput,
} from '@/lib/wall-api'
import {
  applyFirstPage,
  applyOlderPage,
  canPageBack,
  emptyWall,
  withoutLivePost,
  withRestoredPost,
  withUpdatedPost,
  type WallPages,
} from '@/lib/wall-pages'
import { wallBookmarksNotice } from '@/lib/wall-bookmarks-notice'
import type { WallBodyView } from '@/lib/use-wall'
import type { WallPost, WallVoteDirection } from '@/lib/types'

/**
 * The Saved view: this person's own bookmarked Posts, newest saved first.
 *
 * A second reader of the same Posts the default Wall shows, over
 * `GET /wall/posts/bookmarks` rather than `GET /wall/posts` — the API pages
 * both on the *Post's* own id, so every pure function `lib/wall-pages`
 * already has for paging, folding in an edit, or dropping a live removal
 * applies here unchanged.
 *
 * What is not shared is the hook shell. `lib/use-wall`'s `useWallPages` is
 * already the backbone the default Wall and a named one both stand on, and
 * this screen's one real difference — what a tap on the bookmark control
 * means — is exactly the kind of thing that should be free to drift rather
 * than be threaded through a third branch of an already-shared hook. See
 * `toggleBookmark` below.
 *
 * `react`, `vote`, `editPost` and `removePost` otherwise carry a bookmarked
 * Post the same way the default Wall's own `useWallPages` does — the same
 * requests, the same optimistic three steps, rolled back onto whatever this
 * view now holds rather than the stale copy a tap read.
 *
 * No realtime subscription, on purpose, and for the same reason a named Wall
 * declines one (`lib/use-wall`'s own module doc): a live Post's room
 * membership answers for the default Wall's whole set, not for one caller's
 * private bookmark list, so nothing here could tell a Post worth folding in
 * from one that is not. A relaunch of this screen is how it catches up.
 * Nothing here is persisted either — `lib/wall-persistence.test.ts` discovers
 * this file by the same naming convention every other Wall module follows.
 */
export function useWallBookmarks(): WallBodyView {
  const { state } = useAuth()
  const viewer: WallPostViewer | null =
    state.status === 'signed-in' ? { id: state.user.id, role: state.user.role } : null

  const [read, setRead] = useState<WallPages>(emptyWall)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  /** Which read the answer coming back belongs to — see `lib/use-wall`'s own. */
  const generation = useRef(0)

  const loadFirst = useCallback(() => {
    const mine = (generation.current += 1)

    void listWallBookmarks().then(result => {
      if (generation.current !== mine) return
      setRefreshing(false)
      setLoading(false)

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      setRead(applyFirstPage(result.value, WALL_BOOKMARKS_PAGE_LIMIT))
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
    void listWallBookmarks({ cursor }).then(result => {
      setLoadingOlder(false)
      if (generation.current !== mine) return

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      setRead(current => applyOlderPage(current, result.value, WALL_BOOKMARKS_PAGE_LIMIT))
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

  /** Which attempt at reacting to a Post is the newest — see `lib/use-wall`'s own. */
  const reactionAttempt = useRef(new Map<string, number>())

  const react = useCallback(
    (postId: string, emoji: string) => {
      const userId = viewer?.id
      if (!userId) return

      setRead(current => {
        const before = current.posts.find(post => post.id === postId)
        if (!before) return current
        return withUpdatedPost(current, {
          ...before,
          reactions: toggleWallPostReaction(before.reactions, emoji, userId).reactions,
        })
      })

      const attempt = (reactionAttempt.current.get(postId) ?? 0) + 1
      reactionAttempt.current.set(postId, attempt)

      void reactToWallPost(postId, emoji).then(result => {
        if (reactionAttempt.current.get(postId) !== attempt) return

        setRead(current => {
          if (result.ok) return withUpdatedPost(current, result.value)
          const now = current.posts.find(post => post.id === postId)
          if (!now) return current
          return withUpdatedPost(current, {
            ...now,
            reactions: toggleWallPostReaction(now.reactions, emoji, userId).reactions,
          })
        })
      })
    },
    [viewer],
  )

  /** This viewer's own vote on each Post, by id — see `lib/use-wall`'s own module doc. */
  const [myVotes, setMyVotes] = useState<Record<string, WallVoteDirection>>({})
  const voteAttempt = useRef(new Map<string, number>())

  const vote = useCallback(
    (postId: string, direction: WallVoteDirection) => {
      const userId = viewer?.id
      if (!userId) return

      const previousVote = myVotes[postId] ?? null
      const nextVote = nextWallPostVote(previousVote, direction)

      setRead(current => {
        const before = current.posts.find(post => post.id === postId)
        if (!before) return current
        return withUpdatedPost(current, withVoteDelta(before, previousVote, nextVote))
      })
      setMyVotes(current => {
        const next = { ...current }
        if (nextVote === null) delete next[postId]
        else next[postId] = nextVote
        return next
      })

      const attempt = (voteAttempt.current.get(postId) ?? 0) + 1
      voteAttempt.current.set(postId, attempt)

      void voteOnWallPost(postId, direction).then(result => {
        if (voteAttempt.current.get(postId) !== attempt) return

        if (result.ok) {
          setRead(current => withUpdatedPost(current, result.value))
          return
        }

        setRead(current => {
          const now = current.posts.find(post => post.id === postId)
          if (!now) return current
          return withUpdatedPost(current, withVoteDelta(now, nextVote, previousVote))
        })
        setMyVotes(current => {
          const next = { ...current }
          if (previousVote === null) delete next[postId]
          else next[postId] = previousVote
          return next
        })
      })
    },
    [viewer, myVotes],
  )

  const editPost = useCallback(
    async (postId: string, input: WallPostEditInput): Promise<ApiResult<WallPost>> => {
      const result = await updateWallPost(postId, input)
      if (result.ok) setRead(current => withUpdatedPost(current, result.value))
      return result
    },
    [],
  )

  const removePost = useCallback(async (postId: string): Promise<ApiResult<{ id: string }>> => {
    const result = await removeWallPost(postId)
    if (result.ok) setRead(current => withoutLivePost(current, result.value.id))
    return result
  }, [])

  /**
   * Which Posts this screen has already asked the API to record a view for,
   * this session — see `lib/use-wall`'s own `viewedPosts` for why this is
   * neither persisted nor shared with the default Wall's own set: a Post can
   * be seen on one screen and then the other, and each asks once.
   */
  const viewedPosts = useRef(new Set<string>())

  /** A Post that has actually been on screen, not merely fetched (#85) — see `lib/use-wall`'s own. */
  const recordView = useCallback(
    (post: WallPost) => {
      const userId = viewer?.id
      if (!userId || !shouldRecordWallPostView(post, userId, viewedPosts.current)) return
      viewedPosts.current.add(post.id)

      void recordWallPostView(post.id).then(result => {
        if (result.ok) setRead(current => withUpdatedPost(current, result.value))
      })
    },
    [viewer],
  )

  /** Which attempt at un-bookmarking a Post is the newest — the same reasoning as the others above. */
  const bookmarkAttempt = useRef(new Map<string, number>())

  /**
   * A tap on the bookmark control, here.
   *
   * Every Post in this list is bookmarked by construction, so a tap always
   * means "remove it" — optimistically, at the index its row held, and put
   * back at that same index (`withRestoredPost`) only on a refusal or a dead
   * network. `read` is read directly, before the optimistic update runs,
   * because the index and the Post being removed both have to be known
   * ahead of it — there is nothing left in `read` to recover them from once
   * the row is gone.
   */
  const toggleBookmark = useCallback(
    (postId: string) => {
      const index = read.posts.findIndex(post => post.id === postId)
      if (index === -1) return
      const removed = read.posts[index]

      setRead(current => withoutLivePost(current, postId))

      const attempt = (bookmarkAttempt.current.get(postId) ?? 0) + 1
      bookmarkAttempt.current.set(postId, attempt)

      void toggleWallPostBookmark(postId).then(result => {
        if (bookmarkAttempt.current.get(postId) !== attempt) return
        // Whether the tap came out as the API's add or its remove is read off
        // its answer rather than off the tap, the way every other toggle in
        // this app already is. A success is normally a removal and the row
        // stays gone — but if this device's copy was stale and the toggle
        // *added* the bookmark, the row belongs back, carrying what the API
        // just said about it rather than the copy that was wrong.
        if (result.ok && !result.value.isBookmarked) return
        setRead(current =>
          withRestoredPost(current, result.ok ? result.value : removed, index),
        )
      })
    },
    [read],
  )

  return {
    posts: read.posts,
    notice: wallBookmarksNotice({ drawn: read.posts.length, loading, failure }),
    loadingOlder,
    refreshing,
    canLoadOlder: canPageBack(read),
    loadOlder,
    refresh,
    retry,
    dismissFailure,
    viewer,
    react,
    recordView,
    myVotes,
    vote,
    toggleBookmark,
    editPost,
    removePost,
  }
}
