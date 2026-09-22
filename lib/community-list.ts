import type { ApiResult } from '@/lib/api-result'
import { COMMUNITY_FEED_REFUSED_TITLE } from '@/lib/community-notice'
import { isCommunityThreadRow } from '@/lib/community-parse'
import { failureNotice } from '@/lib/conversation-failure'
import type {
  Community,
  CommunityAnnouncementsRow,
  CommunityFeedRow,
  CommunityJoinableGroupRow,
  CommunityMemberGroupRow,
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
 * The Communities this tab has something to show for: the ones the viewer
 * belongs to, and the ones holding a room they can already open.
 *
 * `GET /communities` is scoped by the API for a Customer and an Agent, and not
 * for an Admin: theirs is every Community in the product, which is the list the
 * web client's admin screen needs. This tab is a different surface asking a
 * different question, so the narrowing happens here rather than by threading a
 * second contract through one endpoint.
 *
 * ## Why membership is not the whole question
 *
 * It was, and that was a hole this tab could not see on its own. Membership and
 * the rooms a person holds are set separately: an Admin is given a Community's
 * Announcements thread and its Groups in `GET /conversations` without being a
 * member of the Community itself — sixteen such threads against zero
 * memberships, on the first account this was tried against.
 *
 * While Chats showed every conversation that did not matter, because the rooms
 * were readable there. Now that Chats holds only what is not a Community's, a
 * Community narrowed away here takes its rooms off *both* halves and the threads
 * are reachable from nowhere at all — which is a worse failure than the bleed
 * this split was made to fix, and the kind only opening the screen finds.
 *
 * So the rule is the one the person would state: if you can open the room, you
 * can see the Community it is in. `conversations` is the list the tab is drawn
 * beside, so the two cannot disagree about which rooms exist.
 *
 * A Community with neither — no membership and no room the viewer holds — is
 * still invisible rather than refused, which is what keeps an Admin's answer
 * from listing every Community in the product.
 */
export function myCommunities(
  communities: readonly Community[],
  viewerId: string | null,
  conversations: readonly Conversation[] = [],
): Community[] {
  if (!viewerId) return []

  const holdsARoomIn = new Set(
    conversations
      .map((conversation) => conversation.communityId)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  )

  return sortCommunities(
    communities.filter(
      (community) =>
        community.memberIds.includes(viewerId) || holdsARoomIn.has(community.id),
    ),
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
/**
 * A Group the feed calls joinable but the viewer already holds a conversation
 * for, read as the room it actually is.
 *
 * The two answers disagree because they are answers to different questions.
 * `GET /communities/:id/groups` classifies by *membership*, and an Admin is not
 * a member of the Groups in an organization they administer — the feed reports
 * `non_member` / `may_request`. `GET /conversations` hands them that Group's
 * conversation anyway, `canWrite: true`, and posting into it works.
 *
 * Drawn from the membership answer alone, such a room appears nowhere: the
 * Communities tab skips it as joinable, and the inbox no longer holds it because
 * it belongs to a Community. So the conversation wins, which is the rule the
 * rest of this client already follows — ADR-0008 makes the Conversation list the
 * source of truth, and holding the conversation is what being in a room means.
 *
 * `Ask to join` is still right for a Group with no conversation behind it, which
 * is every joinable row this does not convert.
 */
function heldJoinableGroup(
  row: CommunityJoinableGroupRow,
  conversations: readonly Conversation[],
): CommunityMemberGroupRow | null {
  const live = conversations.find((conversation) => conversation.id === row.id)
  if (!live) return null

  return {
    kind: 'member_group',
    id: row.id,
    title: row.title,
    avatarUrl: row.avatarUrl,
    lastMessageAt: live.lastMessageAt,
    lastMessagePreview: live.lastMessagePreview,
    unreadCount: live.unreadCount ?? 0,
    // The feed says nothing about muting a room it does not think you are in.
    muted: false,
    joinPolicy: row.joinPolicy,
  }
}

export function communityThreads(
  rows: readonly CommunityFeedRow[],
  conversations: readonly Conversation[] = [],
): {
  announcements: CommunityAnnouncementsRow | null
  groups: CommunityMemberGroupRow[]
} {
  const held = rows
    .filter((row): row is CommunityJoinableGroupRow => row.kind === 'joinable_group')
    .map((row) => heldJoinableGroup(row, conversations))
    .filter((row): row is CommunityMemberGroupRow => row !== null)

  const threads = [...rows.filter(isCommunityThreadRow), ...held]
  const announcements =
    threads.find((row): row is CommunityAnnouncementsRow => row.kind === 'announcements') ?? null
  const groups = threads
    .filter((row): row is CommunityMemberGroupRow => row.kind === 'member_group')
    .sort((a, b) => {
      const difference = rowActivityAt(b) - rowActivityAt(a)
      return difference !== 0 ? difference : a.title.localeCompare(b.title)
    })

  return { announcements, groups }
}

/** The Community screen's three parts: its pinned thread, and the two named sections beneath it. */
export type CommunitySections = {
  announcements: CommunityAnnouncementsRow | null
  /** `Groups you're in` — a conversation row apiece, newest activity first. */
  joined: CommunityMemberGroupRow[]
  /** `Groups you can join` — nothing to open yet, so alphabetical is the only order there is. */
  joinable: CommunityJoinableGroupRow[]
}

/**
 * A Community's whole feed, split into the sections the Community screen draws
 * (#73): the pinned Announcements thread, the Groups the viewer is already in,
 * and the Groups they may join or have asked to.
 *
 * Reuses `communityThreads` for the first two rather than filtering the feed a
 * second time, so the one ordering rule for a joined Group lives in one place.
 */
export function communitySections(
  rows: readonly CommunityFeedRow[],
  conversations: readonly Conversation[] = [],
): CommunitySections {
  const { announcements, groups } = communityThreads(rows, conversations)
  // A Group promoted above — one the viewer already holds — is not also
  // something to ask to join.
  const joined = new Set(groups.map((row) => row.id))
  const joinable = rows
    .filter(
      (row): row is CommunityJoinableGroupRow =>
        row.kind === 'joinable_group' && !joined.has(row.id),
    )
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))

  return { announcements, joined: groups, joinable }
}

/**
 * One row of the Community screen's own flat list.
 *
 * The same idiom `communityTabRows` uses for the tab, for the same reason: two
 * named sections that can each be empty are simpler as rows a virtualised list
 * already knows how to draw than as a `SectionList` with its own header and
 * empty-section plumbing to keep in sync with this module's decisions.
 */
export type CommunityScreenRow =
  | { kind: 'announcements'; key: string; row: CommunityAnnouncementsRow }
  | { kind: 'section'; key: string; title: string }
  | { kind: 'thread'; key: string; row: CommunityMemberGroupRow }
  | { kind: 'joined-empty'; key: string }
  | { kind: 'joinable'; key: string; row: CommunityJoinableGroupRow }
  | { kind: 'joinable-empty'; key: string }

export const JOINED_SECTION_TITLE = "Groups you're in"
export const JOINABLE_SECTION_TITLE = 'Groups you can join'

/**
 * The Community screen, flattened: the pinned thread, then `Groups you're in`,
 * then `Groups you can join` — always both headers, so a Community with
 * nothing in one of them reads as *that section has nothing* rather than as
 * a list that quietly dropped a heading.
 */
export function communityScreenRows(sections: CommunitySections): CommunityScreenRow[] {
  const rows: CommunityScreenRow[] = []

  if (sections.announcements) {
    rows.push({
      kind: 'announcements',
      key: `announcements:${sections.announcements.id}`,
      row: sections.announcements,
    })
  }

  rows.push({ kind: 'section', key: 'section:joined', title: JOINED_SECTION_TITLE })
  if (sections.joined.length === 0) {
    rows.push({ kind: 'joined-empty', key: 'empty:joined' })
  } else {
    for (const row of sections.joined) rows.push({ kind: 'thread', key: `thread:${row.id}`, row })
  }

  rows.push({ kind: 'section', key: 'section:joinable', title: JOINABLE_SECTION_TITLE })
  if (sections.joinable.length === 0) {
    rows.push({ kind: 'joinable-empty', key: 'empty:joinable' })
  } else {
    for (const row of sections.joinable) {
      rows.push({ kind: 'joinable', key: `joinable:${row.id}`, row })
    }
  }

  return rows
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
export function withLiveThread<T extends CommunityThreadRow>(
  row: T,
  conversations: readonly Conversation[],
): T {
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

/**
 * A Community's sections, with the pinned thread and every joined Group told
 * what the Conversation list already knows about it.
 *
 * The Groups somebody may join carry no thread — nothing to overlay — so they
 * pass through untouched.
 */
export function withLiveSections(
  sections: CommunitySections,
  conversations: readonly Conversation[],
): CommunitySections {
  return {
    announcements: sections.announcements
      ? withLiveThread(sections.announcements, conversations)
      : null,
    joined: sections.joined.map((row) => withLiveThread(row, conversations)),
    joinable: sections.joinable,
  }
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
      const { announcements, groups } = communityThreads(feed.rows, conversations)
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
