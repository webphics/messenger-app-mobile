import type { ApiResult } from '@/lib/api-result'
import { COMMUNITY_FEED_REFUSED_TITLE } from '@/lib/community-notice'
import { isCommunityThreadRow } from '@/lib/community-parse'
import { failureNotice } from '@/lib/conversation-failure'
import type {
  Community,
  CommunityFeedRow,
  CommunityThreadRow,
  Conversation,
} from '@/lib/types'

/**
 * What the Communities tab shows, and in what order.
 *
 * Pure, like `lib/conversation-list` next door and for the same reason: which
 * Communities a person may see, what an expanded one puts on screen and how many
 * of its Groups fit there are decisions a table can be written for, and none of
 * them needs a network or a device to demonstrate.
 *
 * The tab is one flat list rather than a list of lists. A Community expands in
 * place — WhatsApp's shape, and the web client's — and several expanded at once
 * has to stay smooth, so the rows are flattened here and handed to one
 * virtualised list. Nesting a scroller per Community would give every one of
 * them its own windowing and none of them the outer list's.
 */

/**
 * How many of a Community's Groups are drawn beneath it before `View all`.
 *
 * WhatsApp shows a handful; this is that handful. It is also what keeps the tab
 * bounded with several Communities expanded — the cost of expanding one is a
 * fixed number of rows rather than however many rooms somebody happens to be in.
 */
export const MAX_INLINE_GROUPS = 3

/**
 * The Communities the viewer is actually in.
 *
 * `GET /communities` is scoped by the API for a Customer and an Agent, and not
 * for an Admin: theirs is every Community in the product, which is the list the
 * web client's admin screen needs. This tab is a different surface asking a
 * different question — what am I a member of — so the narrowing happens here
 * rather than by threading a second contract through one endpoint.
 *
 * A Community the viewer is not in is invisible, not refused: it never reaches a
 * screen, and because this runs before anything is persisted it never reaches
 * the disk either.
 */
export function myCommunities(
  communities: readonly Community[],
  viewerId: string | null,
): Community[] {
  if (!viewerId) return []
  return sortCommunities(
    communities.filter((community) => community.memberIds.includes(viewerId)),
  )
}

/**
 * By name, then by id.
 *
 * Not by activity, which a Community has none of — it carries no messages, and
 * what happens inside it happens in the Groups it holds. Alphabetical is the
 * order somebody can predict, and sorting through one function is what keeps a
 * Restored list and a fetched one from drifting apart, exactly as
 * `sortConversations` does for the Conversation list.
 */
export function sortCommunities(communities: readonly Community[]): Community[] {
  return [...communities].sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    return byName !== 0 ? byName : a.id.localeCompare(b.id)
  })
}

/** When a feed row was last written in, in epoch milliseconds. Never written in reads 0. */
function rowActivityAt(row: CommunityThreadRow): number {
  if (!row.lastMessageAt) return 0
  const at = Date.parse(row.lastMessageAt)
  return Number.isFinite(at) ? at : 0
}

/**
 * A Community's feed as the two things a member can open: its Announcements
 * thread, and the Groups they are in.
 *
 * Announcements first and always, whatever it was last written in — it is
 * pinned, which is the API's own word for it. The Groups follow it newest first,
 * so the room somebody is actually talking in is the one under their thumb.
 *
 * A Community with no Groups the viewer is in still has its Announcements, which
 * is why these come back apart rather than as one ordered list with a rule about
 * the head of it.
 */
export function communityThreads(rows: readonly CommunityFeedRow[]): {
  announcements: CommunityThreadRow | null
  groups: CommunityThreadRow[]
} {
  const threads = rows.filter(isCommunityThreadRow)
  const announcements = threads.find((row) => row.kind === 'announcements') ?? null
  const groups = threads
    .filter((row) => row.kind === 'member_group')
    .sort((a, b) => {
      const difference = rowActivityAt(b) - rowActivityAt(a)
      return difference !== 0 ? difference : a.title.localeCompare(b.title)
    })

  return { announcements, groups }
}

/**
 * A feed row, told what the Conversation list already knows about the same
 * thread.
 *
 * A feed is fetched when a Community is expanded and not again; the Conversation
 * list is the copy the socket keeps moving, and it holds every one of these
 * threads — a Group somebody is in and a Community's Announcements both arrive
 * in `GET /conversations`. So where the two overlap the list wins, and a message
 * landing in a Group while its Community is open moves the row underneath it
 * without a second request. See ADR-0008: the Store is the source of truth.
 *
 * It is also the only place a Community's Announcements thread has an unread
 * count at all: the API's Announcements shape carries none, and the thread is in
 * `GET /conversations` like any other. `muted` runs the other way — a
 * conversation row does not carry it — so that stays the feed's, which is the
 * only place it is said.
 */
export function withLiveThread(
  row: CommunityThreadRow,
  conversations: readonly Conversation[],
): CommunityThreadRow {
  const live = conversations.find((conversation) => conversation.id === row.id)
  if (!live) return row

  const next = {
    ...row,
    lastMessageAt: live.lastMessageAt,
    lastMessagePreview: live.lastMessagePreview,
    unreadCount: live.unreadCount ?? row.unreadCount,
  }

  // The same row back when the live copy says what this one already said. The
  // list re-reads every drawn row whenever a socket event moves anything, and
  // without this every one of them would be a new object — so `memo` on the row
  // would never hold and one message would re-render every expanded Community.
  // The same identity rule `withConversationRead` follows for the inbox.
  return next.lastMessageAt === row.lastMessageAt &&
    next.lastMessagePreview === row.lastMessagePreview &&
    next.unreadCount === row.unreadCount
    ? row
    : next
}

/** What a Community's feed is doing, as the tab and the Community screen both read it. */
export type CommunityFeed =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; rows: CommunityFeedRow[] }

/**
 * What a feed becomes when a read of it answers.
 *
 * Both surfaces that read a Community's rooms — the tab, for each Community it
 * has open, and the Community screen — ask the same question of the answer, so
 * they ask it here rather than each deciding for itself. The decision is the one
 * `read-notice` makes for a list: a failure over rows that are already drawn
 * leaves them, because what is drawn is still true, and only a feed with nothing
 * behind it becomes a failure somebody has to act on.
 *
 * `drawn` is what the surface is showing now — a Restored feed, most often,
 * which is exactly the case that must survive a read that did not land.
 */
export function feedAfterRead(
  result: ApiResult<CommunityFeedRow[]>,
  drawn: CommunityFeed | null,
): CommunityFeed {
  if (result.ok) return { status: 'ready', rows: result.value }
  if (drawn?.status === 'ready' && drawn.rows.length > 0) return drawn

  return { status: 'failed', ...failureNotice(result.failure, COMMUNITY_FEED_REFUSED_TITLE) }
}

/**
 * One row of the Communities tab.
 *
 * Every state an expanded Community can be in is a row rather than a branch at
 * the renderer, so the one virtualised list sees all of them and a Community
 * whose feed is still loading occupies the space its rows are about to.
 */
export type CommunityTabRow =
  | { kind: 'community'; key: string; community: Community; expanded: boolean }
  | { kind: 'feed-loading'; key: string; communityId: string }
  | { kind: 'feed-failed'; key: string; communityId: string; title: string; hint: string }
  | { kind: 'thread'; key: string; communityId: string; row: CommunityThreadRow }
  | { kind: 'feed-empty'; key: string; communityId: string }
  | { kind: 'view-all'; key: string; community: Community }

export type CommunityTabInput = {
  communities: readonly Community[]
  expanded: ReadonlySet<string>
  feeds: ReadonlyMap<string, CommunityFeed>
  /** The live copy of every thread a feed names. See `withLiveThread`. */
  conversations: readonly Conversation[]
}

/**
 * The tab, flattened.
 *
 * A collapsed Community is one row. An expanded one is its header, whatever its
 * feed has to say, and `View all` — which is drawn whatever the feed did,
 * because the header row expands rather than navigates and this is the only way
 * into the Community screen. A feed that failed must not also strand somebody
 * with nowhere to go.
 */
export function communityTabRows({
  communities,
  expanded,
  feeds,
  conversations,
}: CommunityTabInput): CommunityTabRow[] {
  const rows: CommunityTabRow[] = []

  for (const community of communities) {
    const isExpanded = expanded.has(community.id)
    rows.push({
      kind: 'community',
      key: `community:${community.id}`,
      community,
      expanded: isExpanded,
    })
    if (!isExpanded) continue

    const feed: CommunityFeed = feeds.get(community.id) ?? { status: 'loading' }

    if (feed.status === 'loading') {
      rows.push({
        kind: 'feed-loading',
        key: `loading:${community.id}`,
        communityId: community.id,
      })
    } else if (feed.status === 'failed') {
      rows.push({
        kind: 'feed-failed',
        key: `failed:${community.id}`,
        communityId: community.id,
        title: feed.title,
        hint: feed.hint,
      })
    } else {
      const { announcements, groups } = communityThreads(feed.rows)
      const inline = groups.slice(0, MAX_INLINE_GROUPS)
      const drawn = announcements ? [announcements, ...inline] : inline

      for (const row of drawn) {
        rows.push({
          kind: 'thread',
          key: `thread:${community.id}:${row.id}`,
          communityId: community.id,
          row: withLiveThread(row, conversations),
        })
      }

      if (drawn.length === 0) {
        rows.push({
          kind: 'feed-empty',
          key: `empty:${community.id}`,
          communityId: community.id,
        })
      }
    }

    rows.push({ kind: 'view-all', key: `view-all:${community.id}`, community })
  }

  return rows
}
