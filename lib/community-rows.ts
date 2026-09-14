import { asRecord } from '@/lib/api-envelope'
import { sortCommunities } from '@/lib/community-list'
import type { Community, CommunityFeedRow, GroupJoinPolicy } from '@/lib/types'

/**
 * A Community as a row, and a row back as a Community.
 *
 * The same split `lib/store-rows` makes for the Conversation list and for the
 * same reason: nothing here imports `expo-sqlite`, so the mapping that decides
 * what survives a restart is a table of cases rather than something only a
 * device can demonstrate. What is on the other side of that boundary — the
 * connection, the schema, the transaction — is `lib/conversation-store.ts`, the
 * one file in this app that knows SQLite exists. See ADR-0008.
 *
 * Its own module rather than more of `store-rows` because the two answer
 * different questions and are read by different screens. What they share is the
 * shape of the answer: column names rather than camelCase, because a row read
 * out of the database *is* one of these; a payload written whole; and an
 * unreadable row dropped rather than thrown over, because one of those is not a
 * reason to show somebody an empty tab.
 *
 * What they do not share is the reader. A `Conversation` is the API's payload,
 * so `store-rows` reads a row back through the parser a fetched page goes
 * through. A `Community` is not: the API answers with a member list and a list
 * of linked groups, and this app keeps the two questions it actually asks — who
 * is in it, and how many rooms it holds. So the disk holds this app's shape and
 * the network holds the API's, and each source has its own total reader.
 * `readCommunity` and `readFeedRow` below are the Store's.
 */

/**
 * One row of the `communities` table.
 *
 * Only the Communities the viewer is in are ever written — `myCommunities` runs
 * before this does — so a Community somebody is not in is invisible on disk as
 * well as on screen.
 */
export type CommunityRow = {
  id: string
  owner_id: string
  /** The Community as this app holds it, serialised. Read back through `readCommunity`. */
  payload: string
  /**
   * Whether this Community is open in the tab. SQLite has no boolean.
   *
   * A column on the Community rather than a table of its own: there is exactly
   * one of these per Community per person, and a second table would be a join to
   * learn what a column already says — the reasoning `ThreadPaging` rides on a
   * conversation row for. Persisted at all because an expansion has to survive a
   * relaunch, and it is wiped with everything else when a Session ends.
   */
  expanded: number
}

/**
 * One row of the `community_groups` table: one line of one Community's feed.
 *
 * `position` is the order the API answered in, kept because the feed's own order
 * is the API's decision — Announcements first — and reading it back in a
 * different one would make a Restored feed a different feed. What the *tab*
 * draws is still `communityThreads`, which sorts what it is given; this only
 * keeps the rows from coming back shuffled underneath it.
 */
export type CommunityGroupRow = {
  id: string
  community_id: string
  owner_id: string
  position: number
  /** The feed row as this app holds it, serialised. Read back through `readFeedRow`. */
  payload: string
}

/** A Community's feed, as one Restore answers it. */
export type RestoredCommunities = {
  communities: Community[]
  expanded: ReadonlySet<string>
}

const NOBODY_EXPANDED: ReadonlySet<string> = new Set()

/** Nothing on disk, or nothing readable. The two are the same to a caller. */
export const NO_COMMUNITIES: RestoredCommunities = {
  communities: [],
  expanded: NOBODY_EXPANDED,
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * A stored Community, read back.
 *
 * Total, like every parser in this app: a row written by a build that held a
 * different shape answers null and is dropped, rather than reaching a screen as
 * a Community with no name. What is required is what this app would be inventing
 * if it defaulted — the id, the name, the membership the tab is narrowed by.
 */
function readCommunity(value: unknown): Community | null {
  const row = asRecord(value)
  if (!row) return null

  const id = text(row.id)
  const name = text(row.name)
  const createdAt = text(row.createdAt)
  if (!id || !name || !createdAt) return null

  return {
    id,
    name,
    description: text(row.description),
    avatarUrl: text(row.avatarUrl),
    memberCount: count(row.memberCount),
    linkedGroupCount: count(row.linkedGroupCount),
    memberIds: Array.isArray(row.memberIds)
      ? row.memberIds.filter((member): member is string => typeof member === 'string')
      : [],
    createdAt,
  }
}

const JOIN_POLICIES: readonly GroupJoinPolicy[] = ['request', 'open']

function joinPolicy(value: unknown): GroupJoinPolicy {
  return (JOIN_POLICIES as readonly string[]).includes(value as string)
    ? (value as GroupJoinPolicy)
    : 'request'
}

/**
 * A stored feed row, read back, in whichever of the three shapes it was written.
 *
 * The discriminator is the one this app wrote — a row that does not name a kind
 * it knows is dropped rather than guessed at, for the same reason the parser
 * beside it refuses a membership it cannot place.
 */
function readFeedRow(value: unknown): CommunityFeedRow | null {
  const row = asRecord(value)
  if (!row) return null

  const id = text(row.id)
  const title = text(row.title)
  if (!id || !title) return null

  if (row.kind === 'announcements') {
    return {
      kind: 'announcements',
      id,
      title,
      lastMessageAt: text(row.lastMessageAt),
      lastMessagePreview: text(row.lastMessagePreview),
      unreadCount: count(row.unreadCount),
    }
  }

  if (row.kind === 'member_group') {
    return {
      kind: 'member_group',
      id,
      title,
      avatarUrl: text(row.avatarUrl),
      lastMessageAt: text(row.lastMessageAt),
      lastMessagePreview: text(row.lastMessagePreview),
      unreadCount: count(row.unreadCount),
      muted: row.muted === true,
      joinPolicy: joinPolicy(row.joinPolicy),
    }
  }

  if (row.kind !== 'joinable_group') return null
  return {
    kind: 'joinable_group',
    id,
    title,
    avatarUrl: text(row.avatarUrl),
    memberCount: count(row.memberCount),
    joinPolicy: joinPolicy(row.joinPolicy),
    joinState: row.joinState === 'pending' ? 'pending' : 'may_request',
  }
}

/**
 * A person's Communities as rows.
 *
 * Owned by a person, because a phone is shared: rows are written under the
 * viewer they belong to and read back under the same one, so the next person to
 * sign in on this device Restores nothing rather than somebody else's rooms.
 */
export function toCommunityRows(
  ownerId: string,
  communities: readonly Community[],
  expanded: ReadonlySet<string>,
): CommunityRow[] {
  return communities.map((community) => ({
    id: community.id,
    owner_id: ownerId,
    payload: JSON.stringify(community),
    expanded: expanded.has(community.id) ? 1 : 0,
  }))
}

/**
 * Rows back into a person's Communities, in the order the tab shows them.
 *
 * Takes `unknown` because that is what a database holds: these rows were written
 * by some build of this app, and the one reading them is not necessarily the one
 * that wrote them.
 *
 * Sorted through `sortCommunities` rather than by a column, so a Restored list
 * and a fetched one are ordered by the same function and cannot drift apart.
 */
export function fromCommunityRows(rows: readonly unknown[]): RestoredCommunities {
  const communities: Community[] = []
  const expanded = new Set<string>()

  for (const row of rows) {
    const record = row as Partial<CommunityRow> | null
    if (typeof record?.payload !== 'string') continue

    let community: Community | null = null
    try {
      community = readCommunity(JSON.parse(record.payload))
    } catch {
      // Not JSON at all: a truncated write, or a row from a schema this build
      // has no idea about. Either way there is nothing here to draw.
      continue
    }
    if (!community) continue

    communities.push(community)
    if (record.expanded === 1) expanded.add(community.id)
  }

  return { communities: sortCommunities(communities), expanded }
}

/** One Community's feed as rows, in the order the API answered. */
export function toCommunityGroupRows(
  ownerId: string,
  communityId: string,
  rows: readonly CommunityFeedRow[],
): CommunityGroupRow[] {
  return rows.map((row, position) => ({
    id: row.id,
    community_id: communityId,
    owner_id: ownerId,
    position,
    payload: JSON.stringify(row),
  }))
}

/**
 * Rows back into one Community's feed.
 *
 * An unreadable row is dropped rather than thrown over. What it costs is one
 * room missing from a list the network is about to replace anyway; what throwing
 * would cost is the whole feed, on the one device that has no signal to fetch
 * another.
 */
export function fromCommunityGroupRows(rows: readonly unknown[]): CommunityFeedRow[] {
  const feed: CommunityFeedRow[] = []

  for (const row of rows) {
    const payload = (row as Partial<CommunityGroupRow> | null)?.payload
    if (typeof payload !== 'string') continue

    try {
      const parsed = readFeedRow(JSON.parse(payload))
      if (parsed) feed.push(parsed)
    } catch {
      // See `fromCommunityRows`: a row this build cannot read is one row.
    }
  }

  return feed
}
