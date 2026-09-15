import { asRecord } from '@/lib/api-envelope'
import { parseConversation } from '@/lib/conversation-parse'
import type {
  Community,
  CommunityFeedRow,
  CommunityThreadRow,
  GroupJoinOutcome,
  GroupJoinPolicy,
} from '@/lib/types'

/**
 * Reading the API's Community payloads into this app's types.
 *
 * Pure, and separate from the requests that fetch them, exactly as
 * `lib/wall-parse` and `lib/conversation-parse` are: what the API sends is a
 * table of cases rather than something only a running server can demonstrate.
 *
 * The rules are those modules'. A parser answers null for a payload it cannot
 * read; a list drops the rows that answered null rather than failing the whole
 * page, because one unreadable Community is not a reason to show somebody none
 * of them. What is required is what this app would be inventing if it defaulted
 * — an id, a name, the membership a Community is narrowed by — and everything
 * else falls back.
 *
 * What is deliberately not parsed is the administrator's half: who the members
 * are by name, their presence, whether the reader is a Moderator. Administering
 * a Community stays on web, so carrying those would be fields nothing reads and
 * no screen could be wrong about.
 */

const JOIN_POLICIES: readonly GroupJoinPolicy[] = ['request', 'open']

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

/** A count this client cannot read is nothing rather than a guess, and never negative. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Who is in a Community, as the ids the tab is narrowed by.
 *
 * Null for a payload that does not carry a member list at all, which is the one
 * place a default would be dangerous rather than convenient: an absent list
 * would read as a Community nobody is in, every row would be filtered out as
 * somebody else's, and the write-through would then replace this device's
 * Restored Communities with none of them. A membership this client cannot read
 * is not a membership it can deny.
 */
function memberIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap(row => {
    const id = text(asRecord(row)?.id)
    return id === null ? [] : [id]
  })
}

export function parseCommunity(data: unknown): Community | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const name = text(row.name)
  const createdAt = text(row.createdAt)
  const members = memberIds(row.members)
  if (!id || !name || !createdAt || !members) return null

  return {
    id,
    name,
    description: text(row.description),
    avatarUrl: text(row.avatarUrl),
    memberCount: count(row.memberCount),
    linkedGroupCount: Array.isArray(row.linkedGroups) ? row.linkedGroups.length : 0,
    memberIds: members,
    createdAt,
  }
}

/**
 * The Communities on one page.
 *
 * A row this client cannot read is dropped rather than the page — the rule every
 * list parser here follows, because one unreadable Community is not a reason to
 * show somebody none of them.
 *
 * A page where *nothing* was readable is the exception, and it is a different
 * claim: the API sent Communities and this build could make sense of none of
 * them, which is a body this client cannot read rather than a person who belongs
 * to nothing. It answers null, which reaches the tab as `malformed` — so the
 * Communities this device already holds stay on screen with a line above them,
 * instead of being replaced by *No communities yet* and then deleted from the
 * Store by the write-through that follows.
 */
export function parseCommunities(data: unknown): Community[] | null {
  if (!Array.isArray(data)) return null

  const communities = data.flatMap(row => {
    const community = parseCommunity(row)
    return community === null ? [] : [community]
  })

  return data.length > 0 && communities.length === 0 ? null : communities
}

/**
 * One row of a Community's group feed, in whichever of the three shapes the API
 * sent it.
 *
 * The discriminator is read off the payload's own `type` and `membership`
 * rather than inferred from which fields turned up, because that is what the
 * API decided and inferring it would put this client in the business of
 * guessing whether a missing `unreadCount` means zero or means "not yours".
 */
export function parseCommunityFeedRow(data: unknown): CommunityFeedRow | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const title = text(row.title)
  if (!id || !title) return null

  if (row.type === 'announcements') {
    return {
      kind: 'announcements',
      id,
      title,
      lastMessageAt: text(row.lastMessageAt),
      lastMessagePreview: text(row.lastMessagePreview),
      // Not on the wire; the Conversation list is where it comes from.
      unreadCount: 0,
    }
  }

  if (row.type !== 'group') return null
  const joinPolicy = oneOf(row.joinPolicy, JOIN_POLICIES) ?? 'request'

  if (row.membership === 'member') {
    return {
      kind: 'member_group',
      id,
      title,
      avatarUrl: text(row.avatarUrl),
      lastMessageAt: text(row.lastMessageAt),
      lastMessagePreview: text(row.lastMessagePreview),
      unreadCount: count(row.unreadCount),
      muted: row.muted === true,
      joinPolicy,
    }
  }

  if (row.membership !== 'non_member') return null
  return {
    kind: 'joinable_group',
    id,
    title,
    avatarUrl: text(row.avatarUrl),
    memberCount: count(row.memberCount),
    joinPolicy,
    joinState: row.joinState === 'pending' ? 'pending' : 'may_request',
  }
}

export function parseCommunityFeed(data: unknown): CommunityFeedRow[] | null {
  if (!Array.isArray(data)) return null
  return data.flatMap(row => {
    const parsed = parseCommunityFeedRow(row)
    return parsed === null ? [] : [parsed]
  })
}

/** Whether a feed row is one a tap can open. A Group nobody is in has no thread to open. */
export function isCommunityThreadRow(row: CommunityFeedRow): row is CommunityThreadRow {
  return row.kind !== 'joinable_group'
}

/**
 * What `POST /communities/:id/groups/:groupId/join` answered.
 *
 * Only the discriminator and, for `joined`, the conversation beside it are
 * read — a payload naming neither outcome is one this build cannot read, the
 * same rule every parser here follows.
 */
export function parseGroupJoinOutcome(data: unknown): GroupJoinOutcome | null {
  const row = asRecord(data)
  if (!row) return null

  if (row.outcome === 'joined') {
    const conversation = parseConversation(row.conversation)
    return conversation ? { outcome: 'joined', conversation } : null
  }

  return row.outcome === 'requested' ? { outcome: 'requested' } : null
}

/** What `DELETE /communities/:id/members/me` answers: the Community just left, and nothing else. */
export function parseLeftCommunity(data: unknown): { id: string } | null {
  const id = asRecord(data)?.id
  return typeof id === 'string' && id !== '' ? { id } : null
}
