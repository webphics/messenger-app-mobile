import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiFailure, ApiResult } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'
import { toggleWallPostReaction, type WallPostViewer } from '@/lib/wall-actions'
import { listWallPosts, reactToWallPost, removeWallPost, updateWallPost, WALL_PAGE_LIMIT, type WallPostEditInput } from '@/lib/wall-api'
import { parseWallPost } from '@/lib/wall-parse'
import {
  applyFirstPage,
  applyOlderPage,
  canPageBack,
  emptyWall,
  withLivePost,
  withoutLivePost,
  withUpdatedPost,
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
 * part that is neither: when to ask, how to ignore an answer that arrived for
 * a read somebody has already replaced, and — since #78 — what the socket says
 * about a Post while this screen is open.
 *
 * A Post is not a Message, and its live path is deliberately a second one:
 * `post.created`, `.updated` and `.removed` are their own events on the same
 * connection, never the message-created emitter, so nothing here can leak into
 * the message socket path, the In-app banner or anything that draws a
 * notification — none of those listen for a `post-*` event, and this hook is
 * the only thing that does.
 *
 * Nothing is persisted, and nothing is read before somebody asks for it. The
 * first page is fetched when this hook mounts, which is when the Wall tab is
 * first opened — a tab is mounted on the tap that focuses it, so a launch pays
 * nothing for the Wall existing and the Launch gate has no input from here. A
 * pull and the retry on a failed Wall are the two ways to ask again; a later
 * return to the tab draws what is already there rather than emptying the list
 * to re-read it under somebody who had paged back through it.
 *
 * Which is also why a Session end has nothing of its own to destroy: the Posts
 * live in this state and go when the signed-in screens do, and the one thing
 * that does touch the disk — a document opened out of a Post — is downloaded by
 * `lib/attachment-cache` into the directory `session-wipe` already clears.
 * There is no Wall table, nothing under the app's document directory, and no
 * fourth thing for `endSessionOnDevice` to have been taught about. The tripwires
 * are `lib/wall-persistence` and `lib/wall-launch-isolation`.
 *
 * `react`, `editPost` and `removePost` (#75) are the three things a person may
 * do to a Post once it is drawn. Reacting is optimistic, the same three steps
 * a Message reaction already takes: the Post changes first, the request
 * follows, and a refusal or a dead network puts it back — folded through
 * `withUpdatedPost`, the same reducer a live edit or reaction over the socket
 * uses, since to this hook a settled tap and a live update are the same kind
 * of thing happening to a Post it already holds. Editing and removing are not
 * optimistic: both need a screen of their own open on the answer (an edit
 * sheet, a confirmation) before there is anything to show, so they hand their
 * `ApiResult` back rather than guessing.
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
  /** Who is looking, for the actions a Post offers only some readers. Null for the instant between a Session end and the screen leaving. */
  viewer: WallPostViewer | null
  /** A tap on one exact emoji. Optimistic — see the module doc. */
  react: (postId: string, emoji: string) => void
  /** The author's own edit. Patches the Post on success; the caller decides what a refusal means on screen. */
  editPost: (postId: string, input: WallPostEditInput) => Promise<ApiResult<WallPost>>
  /** The author's delete, or an Admin's takedown — the API tells them apart by who is asking, not by a different route. */
  removePost: (postId: string) => Promise<ApiResult<{ id: string }>>
}

export function useWall(): WallView {
  const { state } = useAuth()
  const viewer: WallPostViewer | null =
    state.status === 'signed-in' ? { id: state.user.id, role: state.user.role } : null

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

  /**
   * Which attempt at reacting to a Post is the newest.
   *
   * A second tap on the same Post before the first request answers is a
   * change of mind, not a second reaction: its own answer is the one worth
   * having, so a stale answer that lands after it must not roll back a tap it
   * never refused. Per-Post rather than per-(Post, emoji) — mirrors
   * `use-thread-messages`'s `reacting` ref — because two emoji tapped in quick
   * succession on the same Post are still one conversation with the server
   * about what this Post's reactions are.
   */
  const reactionAttempt = useRef(new Map<string, number>())

  /**
   * A tap on one exact emoji, on one exact Post.
   *
   * The three steps a Message reaction already takes: flip it locally, ask,
   * put it back on a refusal. Never assumes add or remove — `toggleWallPostReaction`
   * (`lib/wall-actions`) computes both the optimistic patch and, on the way
   * back, the exact inverse of it, so the rollback is "toggle this pair again"
   * rather than a second decision that could disagree with the first. There is
   * only one request either way: the API's own route is a single toggle, not
   * an add/remove pair.
   */
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
        // A later tap on the same Post already has its own answer coming, and
        // rolling this one back would undo a reaction the person can see and
        // this device has not been told was refused.
        if (reactionAttempt.current.get(postId) !== attempt) return

        setRead(current => {
          if (result.ok) return withUpdatedPost(current, result.value)

          const now = current.posts.find(post => post.id === postId)
          if (!now) return current
          // Onto the copy the Wall holds now rather than the one the tap read:
          // a live edit or somebody else's reaction can have folded in while
          // the request was out, and putting the whole older Post back would
          // take that with it.
          return withUpdatedPost(current, {
            ...now,
            reactions: toggleWallPostReaction(now.reactions, emoji, userId).reactions,
          })
        })
      })
    },
    [viewer],
  )

  /** The author's own edit. Never optimistic — see the module doc. */
  const editPost = useCallback(
    async (postId: string, input: WallPostEditInput): Promise<ApiResult<WallPost>> => {
      const result = await updateWallPost(postId, input)
      if (result.ok) setRead(current => withUpdatedPost(current, result.value))
      return result
    },
    [],
  )

  /** The author's delete, or an Admin's takedown. Never optimistic — see the module doc. */
  const removePost = useCallback(async (postId: string): Promise<ApiResult<{ id: string }>> => {
    const result = await removeWallPost(postId)
    if (result.ok) setRead(current => withoutLivePost(current, result.value.id))
    return result
  }, [])

  /**
   * What the socket says, while the Wall is on screen.
   *
   * Room membership has already decided which sockets receive a Post at all —
   * every organization the reader belongs to, or every organization for an
   * Admin — so nothing here filters by organization; a live Post reaching this
   * device is by construction one the default Wall shows. The three outcomes
   * are `lib/wall-pages`'s: a creation goes to the top, an edit or a reaction
   * replaces the Post in place without moving it, and a removal drops it — a
   * Post that never made it onto this device's held pages folds into none of
   * the three, which is correct rather than a gap: there is nothing on screen
   * for it to change.
   *
   * `post` arrives unparsed — see `parsePostEnvelope` in `lib/realtime-events`
   * for why the realtime layer cannot read it into a `WallPost` itself. This is
   * the first point a Post payload is read at all, which is also the first
   * point `lib/wall-parse` is reached: safe here, because this hook only runs
   * once somebody has opened the Wall.
   *
   * A resync re-reads the first page exactly as a mount does — nothing was
   * missed while the connection was down that a fresh page cannot repair, and
   * silently: `loadFirst` sets neither `loading` nor `refreshing`, so nothing
   * appears to have happened unless the Wall actually changed underneath it.
   */
  useRealtimeEvents((event: RealtimeEvent) => {
    if (event.kind === 'resync') {
      loadFirst()
      return
    }

    if (event.kind === 'post-created') {
      const post = parseWallPost(event.post)
      if (post) setRead(current => withLivePost(current, post))
      return
    }

    if (event.kind === 'post-updated') {
      const post = parseWallPost(event.post)
      if (post) setRead(current => withUpdatedPost(current, post))
      return
    }

    if (event.kind === 'post-removed') {
      setRead(current => withoutLivePost(current, event.postId))
    }
  })

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
    viewer,
    react,
    editPost,
    removePost,
  }
}
