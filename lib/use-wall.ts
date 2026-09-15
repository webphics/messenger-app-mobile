import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiFailure, ApiResult } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'
import { nextWallPostVote, toggleWallPostReaction, withVoteDelta, type WallPostViewer } from '@/lib/wall-actions'
import {
  createWallPost,
  getNamedWall,
  listWallPosts,
  reactToWallPost,
  removeWallPost,
  updateWallPost,
  voteOnWallPost,
  WALL_PAGE_LIMIT,
  type WallPostCreateInput,
  type WallPostEditInput,
} from '@/lib/wall-api'
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
import type { WallPost, WallVoteDirection } from '@/lib/types'

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
 * `react`, `vote`, `editPost` and `removePost` (#75, `vote` #83) are the things
 * a person may do to a Post once it is drawn. Reacting and voting are both
 * optimistic, the same three steps a Message reaction already takes: the Post
 * changes first, the request follows, and a refusal or a dead network puts it
 * back — folded through `withUpdatedPost`, the same reducer a live edit or
 * reaction over the socket uses, since to this hook a settled tap and a live
 * update are the same kind of thing happening to a Post it already holds.
 * Editing and removing are not optimistic: both need a screen of their own
 * open on the answer (an edit sheet, a confirmation) before there is anything
 * to show, so they hand their `ApiResult` back rather than guessing.
 *
 * "My vote" is not on the Post at all, unlike a reaction: `POST
 * /wall/posts/:id/vote` never says which direction the caller now holds, only
 * the resulting `score`/`upvoteCount` (`docs/api/wall.md` in the messenger-api
 * repo), so nowhere does this app get to read it back from the server —
 * `myVotes` is this hook's own state, kept apart from the Post it describes so
 * that a live `post-updated` for the same Post — somebody else's reaction,
 * somebody else's vote — can replace the whole Post without wiping out what
 * this caller privately knows they voted. It lives no further than this hook:
 * a relaunch of the Wall loses it exactly as it loses everything else the Wall
 * holds, which is the same property `lib/wall-persistence.test.ts` already
 * enforces for the Posts themselves.
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
  /**
   * This viewer's own vote on each Post, by id. Absent means no vote — never
   * read off the Post itself, since the API never says (see the module doc).
   */
  myVotes: Record<string, WallVoteDirection>
  /** A push up or down on one Post. Optimistic — see the module doc. */
  vote: (postId: string, direction: WallVoteDirection) => void
  /**
   * A Contributor's own new Post (#76). Never optimistic — Compose already
   * needs the API's answer to know the upload and the create both went
   * through, the same reasoning `editPost` and `removePost` stand on. Folded
   * to the top of the default Wall on success; a named Wall's screen posts
   * through the same request but never draws the result, the same guard the
   * live socket path already applies for the reason given in the module doc.
   */
  createPost: (input: WallPostCreateInput) => Promise<ApiResult<WallPost>>
  /** The author's own edit. Patches the Post on success; the caller decides what a refusal means on screen. */
  editPost: (postId: string, input: WallPostEditInput) => Promise<ApiResult<WallPost>>
  /** The author's delete, or an Admin's takedown — the API tells them apart by who is asking, not by a different route. */
  removePost: (postId: string) => Promise<ApiResult<{ id: string }>>
}

/**
 * The shared half of a default and a named Wall — everything `lib/wall-pages`
 * and `lib/wall-notice` do not already decide: when to ask, how to ignore an
 * answer superseded by a later one, and the three things a person may do to a
 * Post once it is drawn.
 *
 * `wallId` is the one difference in what gets fetched — undefined reads the
 * default Wall, an id reads that named one through `?wall=` — and it never
 * changes for the life of one screen: a Wall is opened by its id, and nothing
 * on either screen offers to switch which Wall this hook is reading.
 */
function useWallPages(wallId: string | undefined): WallView {
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

    void listWallPosts({ wall: wallId }).then(result => {
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
  }, [wallId])

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
    void listWallPosts({ cursor, wall: wallId }).then(result => {
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
  }, [loadingOlder, read, wallId])

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

  /** This viewer's own vote on each Post, by id — never on the Post itself. See the module doc. */
  const [myVotes, setMyVotes] = useState<Record<string, WallVoteDirection>>({})

  /**
   * Which attempt at voting on a Post is the newest — the same reasoning as
   * `reactionAttempt`, and its own ref rather than a shared one: a vote and a
   * reaction on the same Post are two independent conversations with the
   * server, each free to be superseded by a second tap on itself without the
   * other's answer having anything to say about it.
   */
  const voteAttempt = useRef(new Map<string, number>())

  /**
   * A push up or down on one Post.
   *
   * The same three steps `react` takes. What differs is what "on refusal, put
   * it back" means: a reaction's inverse lives in the reactions array itself,
   * but a vote's previous direction is not recoverable from the Post at all,
   * so it is read from `myVotes` before the optimistic patch and closed over
   * for the rollback — the one place this hook has to remember something
   * `withVoteDelta` cannot derive back out of the Post it is given.
   */
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
        // A later tap on the same Post already has its own answer coming, and
        // rolling this one back would undo a vote the person can see and this
        // device has not been told was refused.
        if (voteAttempt.current.get(postId) !== attempt) return

        if (result.ok) {
          setRead(current => withUpdatedPost(current, result.value))
          return
        }

        setRead(current => {
          const now = current.posts.find(post => post.id === postId)
          if (!now) return current
          // Onto the copy the Wall holds now rather than the one the tap
          // read: a live edit or somebody else's vote can have folded in
          // while the request was out, and reapplying the stale delta onto
          // an older Post would take that with it.
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

  /** A Contributor's own new Post. Never optimistic — see the module doc. */
  const createPost = useCallback(
    async (input: WallPostCreateInput): Promise<ApiResult<WallPost>> => {
      const result = await createWallPost(input)
      if (result.ok && wallId === undefined) {
        setRead(current => withLivePost(current, result.value))
      }
      return result
    },
    [wallId],
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
   *
   * `wallId !== undefined` is guarded out entirely, for the default Wall and
   * a named one alike. Realtime over a named Wall is a ticket of its own
   * (`docs/api/wall.md`'s own Named Walls section says the same for the API
   * side): a live Post's room membership answers for the default Wall's whole
   * set, but not for a named Wall's narrower one, and folding one in here
   * without first knowing which organizations this named Wall actually
   * resolves to would risk drawing a Post from an organization it does not
   * name. `useSharedWall` opens with a plain read instead, and a relaunch of
   * the screen is how it catches up.
   */
  useRealtimeEvents((event: RealtimeEvent) => {
    if (wallId !== undefined) return

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
    notice: wallNotice({ drawn: read.posts.length, loading, failure, named: wallId !== undefined }),
    loadingOlder,
    refreshing,
    canLoadOlder: canPageBack(read),
    loadOlder,
    refresh,
    retry,
    dismissFailure,
    viewer,
    react,
    myVotes,
    vote,
    createPost,
    editPost,
    removePost,
  }
}

/** The default Wall: every organization the signed-in person belongs to. */
export function useWall(): WallView {
  return useWallPages(undefined)
}

/** A shared, named Wall — see `lib/wall-route` and `components/wall/shared-wall-screen`. */
export type SharedWallView = WallView & {
  /**
   * The Wall's own name, once its definition arrives. Null until then, and
   * left null for good if that one read failed — the Posts underneath do not
   * depend on it, so a screen falls back to a generic label rather than
   * blocking on a second request.
   */
  wallName: string | null
}

/**
 * One named Wall, read by its id.
 *
 * `wallId` never changes for the life of the screen it backs — a Wall is
 * opened by the id a shared link carried, and nothing here offers to switch
 * which Wall is open. The Posts come through `useWallPages`, exactly as the
 * default Wall's do; the one thing added here is the Wall's own name, fetched
 * once and separately, because `GET /wall/posts?wall=<id>` never carries it
 * and a shared link has to be able to render *something* to identify the Wall
 * even before its first Post arrives.
 *
 * A Wall that does not resolve at all — deleted, or never existed — is not
 * told apart from any other refusal here: `listWallPosts` already reads
 * `wall_not_found` back as an ordinary `refused` failure, and `wallNotice`
 * puts it on screen the same way it would any other failed read.
 */
export function useSharedWall(wallId: string): SharedWallView {
  const base = useWallPages(wallId)
  const [wallName, setWallName] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getNamedWall(wallId).then(result => {
      if (live && result.ok) setWallName(result.value.name)
    })
    return () => {
      live = false
    }
  }, [wallId])

  return { ...base, wallName }
}
