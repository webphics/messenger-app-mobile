import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApiFailure } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import { listCommunities, listCommunityGroups } from '@/lib/community-api'
import {
  communityTabRows,
  feedAfterRead,
  myCommunities,
  type CommunityFeed,
  type CommunityTabRow,
} from '@/lib/community-list'
import { communityNotice, type CommunityNotice } from '@/lib/community-notice'
import {
  restoreCommunities,
  restoreCommunityFeed,
  saveCommunities,
  saveCommunityFeed,
} from '@/lib/conversation-store'
import { useConversationInbox } from '@/lib/conversation-inbox'
import type { Community, Conversation } from '@/lib/types'

/**
 * The Communities tab: what this phone already holds, and then what the API
 * says.
 *
 * Store-backed the way the Conversation list is, and for the same reason — a
 * member in a tunnel opens the tab on the rooms they were in rather than on a
 * spinner that never resolves. What is Restored draws first and the fetch
 * underneath confirms it; a fetch that fails over Restored rows leaves them and
 * says so in one line, and a fetch that fails over nothing is a screen.
 *
 * The decisions are all somewhere else: `lib/community-list` for which
 * Communities a person may see and what an expanded one puts on screen,
 * `lib/community-notice` for which of the four things a tab with no rows says,
 * `lib/community-rows` and `lib/conversation-store` for the disk. What is left
 * here is the part that is neither — when to ask, and how to ignore an answer
 * that arrived for a read somebody has already replaced.
 *
 * Nothing is fetched until the tab is opened. A Community is not part of the
 * Launch gate: the launch waits on the Conversation list and on nothing else,
 * which is the rule #71 set for the Wall and this is the second surface it
 * applies to.
 */

/**
 * Which Communities are open, by person, for as long as the process lives.
 *
 * Module-level rather than component state because the tab unmounts whenever
 * somebody looks at Chats, and reopening it must not collapse everything they
 * had open. The disk answers the longer version of the same question — a
 * relaunch — through the `expanded` column; this answers the short one without
 * waiting for a queued write to land.
 */
const heldExpansion = new Map<string, Set<string>>()

export type CommunityTabView = {
  /** The tab, flattened: every Community and everything an expanded one shows. */
  rows: CommunityTabRow[]
  /** What the screen says over them: loading, empty, failed, or one line. */
  notice: CommunityNotice
  refreshing: boolean
  toggle: (communityId: string) => void
  isExpanded: (communityId: string) => boolean
  refresh: () => void
  /**
   * Ask for the Communities again, after a read that did not arrive.
   *
   * Not `refresh`: that is a pull, and it reports itself through the control the
   * person pulled. This is a button on a tab with nothing on it, and what it has
   * to show is the tab loading.
   */
  retry: () => void
  /** Ask one Community for its rooms again, after a feed that did not arrive. */
  retryFeed: (communityId: string) => void
  /** Put away a failure reported above Communities that are still drawn. */
  dismissFailure: () => void
}

export function useCommunities(): CommunityTabView {
  const { state } = useAuth()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  /**
   * The Conversation list, which is the live copy of every thread a feed names.
   * See `withLiveThread`: a feed is read once when a Community is expanded, and
   * the socket keeps moving the rows underneath it.
   */
  const inbox = useConversationInbox()
  const conversations = inbox.status === 'ready' ? inbox.conversations : EMPTY_CONVERSATIONS

  const [communities, setCommunities] = useState<Community[]>([])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(NOBODY_EXPANDED)
  const [feeds, setFeeds] = useState<ReadonlyMap<string, CommunityFeed>>(NO_FEEDS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  /**
   * Whose tab the state above describes.
   *
   * Adjusted during render rather than in an effect, the way
   * `useConversationInboxState` does it: an effect runs after its children have
   * rendered, so somebody who has just signed in would get one frame of the
   * previous person's Communities.
   */
  const [describes, setDescribes] = useState<string | null>(null)
  if (describes !== viewerId) {
    setDescribes(viewerId)
    const restored = viewerId ? restoreCommunities(viewerId) : null
    // Nothing on disk is nothing open. A Session end destroys the database, and
    // an expansion held in this module would otherwise outlive the Wipe that was
    // told to remove everything this device knew about somebody's rooms — so a
    // Store with no Communities in it collapses the tab rather than being
    // overruled by what a previous session remembered.
    const held = restored && restored.communities.length > 0 && viewerId
      ? heldExpansion.get(viewerId)
      : undefined
    const open = viewerId ? (held ?? new Set(restored?.expanded ?? [])) : new Set<string>()
    if (viewerId) heldExpansion.set(viewerId, open)

    setCommunities(restored?.communities ?? [])
    setExpanded(open)
    setFeeds(NO_FEEDS)
    setLoading(true)
    setRefreshing(false)
    setFailure(null)
  }

  /** Which read the answer coming back belongs to. A refresh mid-flight wins. */
  const generation = useRef(0)
  /** Which Communities have been asked for their rooms during this read. */
  const asked = useRef(new Set<string>())
  /**
   * What makes a re-ask happen.
   *
   * The effect below asks for the rooms of every open Community it has not
   * already asked about, so forgetting that it asked is only half of a retry:
   * the set of open Communities has not moved, and without this the effect would
   * never run again and the row would spin for the life of the screen.
   */
  const [epoch, setEpoch] = useState(0)

  const loadCommunities = useCallback(() => {
    if (!viewerId) return
    const mine = (generation.current += 1)

    void listCommunities().then((result) => {
      if (generation.current !== mine) return
      setRefreshing(false)
      setLoading(false)

      if (!result.ok) {
        setFailure(result.failure)
        return
      }
      setFailure(null)
      // Narrowed before anything is drawn and before anything is written: an
      // Admin's answer is every Community there is, and one they are not in has
      // to be invisible rather than refused — on the disk as well as on screen.
      setCommunities(myCommunities(result.value, viewerId))
    })
  }, [viewerId])

  useEffect(() => {
    asked.current.clear()
    loadCommunities()
    return () => {
      generation.current += 1
    }
  }, [loadCommunities])

  /**
   * Every state the tab reaches, written through to the Store.
   *
   * Observed here rather than written at each transition, exactly as the
   * Conversation list is: a fetch, an expansion and a sign-out all end up in
   * this one piece of state, so watching it persists all three. Off the render
   * path, queued rather than written, and nothing here can fail.
   */
  useEffect(() => {
    if (!viewerId || loading) return
    void saveCommunities(viewerId, { communities, expanded })
  }, [viewerId, communities, expanded, loading])

  /**
   * A Community that is open and has not been asked yet: its rooms off the disk
   * first, then off the API.
   *
   * The disk read is synchronous and lands in the same commit as the request
   * going out, so an expanded Community draws what this phone holds rather than
   * a spinner it will replace a moment later. A Community with nothing held
   * shows the spinner, which is the honest answer for one this device has never
   * opened.
   */
  useEffect(() => {
    if (!viewerId) return
    void epoch

    for (const communityId of expanded) {
      if (asked.current.has(communityId)) continue
      asked.current.add(communityId)

      const held = restoreCommunityFeed(viewerId, communityId)
      if (held.length > 0) {
        setFeeds((current) => withFeed(current, communityId, { status: 'ready', rows: held }))
      }

      const mine = generation.current
      void listCommunityGroups(communityId).then((result) => {
        if (generation.current !== mine) return

        setFeeds((current) =>
          withFeed(current, communityId, feedAfterRead(result, current.get(communityId) ?? null)),
        )
        if (result.ok) void saveCommunityFeed(viewerId, communityId, result.value)
      })
    }
  }, [viewerId, expanded, epoch])

  const toggle = useCallback(
    (communityId: string) => {
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(communityId)) next.delete(communityId)
        else next.add(communityId)
        if (viewerId) heldExpansion.set(viewerId, next)
        return next
      })
    },
    [viewerId],
  )

  const isExpanded = useCallback(
    (communityId: string) => expanded.has(communityId),
    [expanded],
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    asked.current.clear()
    setEpoch((count) => count + 1)
    loadCommunities()
  }, [loadCommunities])

  const retry = useCallback(() => {
    setFailure(null)
    setLoading(true)
    asked.current.clear()
    setEpoch((count) => count + 1)
    loadCommunities()
  }, [loadCommunities])

  /**
   * One Community's rooms, asked for again.
   *
   * Forgetting that it was asked is the whole of it: the effect above is what
   * asks, and it asks for every open Community it has not already asked about.
   */
  const retryFeed = useCallback((communityId: string) => {
    asked.current.delete(communityId)
    setFeeds((current) => withFeed(current, communityId, { status: 'loading' }))
    setEpoch((count) => count + 1)
  }, [])

  const dismissFailure = useCallback(() => setFailure(null), [])

  const rows = useMemo(
    () => communityTabRows({ communities, expanded, feeds, conversations }),
    [communities, expanded, feeds, conversations],
  )

  return {
    rows,
    notice: communityNotice({ drawn: communities.length, loading, failure }),
    refreshing,
    toggle,
    isExpanded,
    refresh,
    retry,
    retryFeed,
    dismissFailure,
  }
}

const NOBODY_EXPANDED: ReadonlySet<string> = new Set()
const NO_FEEDS: ReadonlyMap<string, CommunityFeed> = new Map()
const EMPTY_CONVERSATIONS: readonly Conversation[] = []

function withFeed(
  current: ReadonlyMap<string, CommunityFeed>,
  communityId: string,
  feed: CommunityFeed,
): ReadonlyMap<string, CommunityFeed> {
  const next = new Map(current)
  next.set(communityId, feed)
  return next
}

/**
 * Which Community this is, off the disk.
 *
 * Read rather than fetched, and deliberately not a share of the tab's state: the
 * Community screen is a route of its own and mounting it must not start the
 * tab's read again. Everything the header needs — a name, a member count — was
 * written when the tab last answered, so it is here with no signal and in the
 * frame the screen first draws.
 *
 * A Community this device has never held answers null. The header says so by
 * naming nothing; the rooms below it are fetched either way, which is what the
 * screen is for.
 */
export function useStoredCommunity(communityId: string | null): Community | null {
  const { state } = useAuth()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  return useMemo(() => {
    if (!viewerId || !communityId) return null
    return (
      restoreCommunities(viewerId).communities.find(
        (community) => community.id === communityId,
      ) ?? null
    )
  }, [viewerId, communityId])
}

/**
 * One Community's rooms, for the Community screen.
 *
 * The same two reads the tab makes for an expanded Community — the Store first,
 * then the API — and deliberately not a share of its state: the screen is a
 * route of its own, reached from `View all` and from a relaunch onto it, and a
 * tab that was never opened has nothing to hand it.
 */
export function useCommunityFeed(communityId: string | null): {
  feed: CommunityFeed
  refresh: () => void
  refreshing: boolean
} {
  const { state } = useAuth()
  const viewerId = state.status === 'signed-in' ? state.user.id : null

  const [feed, setFeed] = useState<CommunityFeed>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const generation = useRef(0)

  const load = useCallback(() => {
    if (!viewerId || !communityId) return
    const mine = (generation.current += 1)

    const held = restoreCommunityFeed(viewerId, communityId)
    if (held.length > 0) setFeed({ status: 'ready', rows: held })

    void listCommunityGroups(communityId).then((result) => {
      if (generation.current !== mine) return
      setRefreshing(false)

      setFeed((current) => feedAfterRead(result, current))
      if (result.ok) void saveCommunityFeed(viewerId, communityId, result.value)
    })
  }, [viewerId, communityId])

  useEffect(() => {
    load()
    return () => {
      generation.current += 1
    }
  }, [load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  return { feed, refresh, refreshing }
}
