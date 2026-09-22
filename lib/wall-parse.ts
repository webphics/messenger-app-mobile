import { asRecord } from '@/lib/api-envelope'
import { wallPostKinds } from '@/lib/types'
import type {
  NamedWall,
  WallAttachmentKind,
  WallPost,
  WallPostAttachment,
  WallPostAuthor,
  WallPostKind,
  WallPostLink,
  WallPostReaction,
} from '@/lib/types'

/**
 * Reading the API's Wall payloads into this app's types.
 *
 * Pure, and separate from the requests that fetch them, exactly as
 * `lib/conversation-parse` is: what the API sends is a table of cases rather
 * than something only a running server can demonstrate.
 *
 * The rules are that module's. A parser answers null for a payload it cannot
 * read; a list drops the rows that answered null rather than failing the whole
 * page, because one unreadable Post is not a reason to show a person nothing.
 * What is required is what this app would be inventing if it defaulted — an id,
 * an author, an organization, a timestamp — and everything else falls back.
 *
 * The parts of the response this client does not render yet are deliberately not
 * parsed. `score` and `upvoteCount` (#83), `isBookmarked` (#84), and
 * `viewCount` (#85) are read because a screen now draws each of them.
 */

const ATTACHMENT_KINDS: readonly WallAttachmentKind[] = ['image', 'video', 'document']

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Anything other than a literal `true` reads as not bookmarked, rather than as unknown. */
function flag(value: unknown): boolean {
  return value === true
}

/**
 * An attachment, or null for one this client cannot draw.
 *
 * A kind outside the three is dropped rather than guessed at: the API adding a
 * fourth should show as nothing on an old build, which is what a reader can make
 * sense of, rather than as an image that will not load.
 */
export function parseWallAttachment(data: unknown): WallPostAttachment | null {
  const row = asRecord(data)
  if (!row) return null

  const kind = oneOf(row.type, ATTACHMENT_KINDS)
  const url = text(row.url)
  if (!kind || !url) return null

  return { kind, url, fileName: text(row.fileName), size: optionalNumber(row.size) }
}

/** A link only counts when it has both halves: a label to press and somewhere to go. */
export function parseWallLink(data: unknown): WallPostLink | null {
  const row = asRecord(data)
  if (!row) return null

  const label = text(row.label)
  const url = text(row.url)
  return label && url ? { label, url } : null
}

function parseAuthor(data: unknown): WallPostAuthor | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  if (!id) return null
  return { id, name: text(row.name) ?? 'Someone' }
}

function parseReaction(data: unknown): WallPostReaction | null {
  const row = asRecord(data)
  if (!row) return null

  const emoji = text(row.emoji)
  const userId = text(row.userId)
  return emoji && userId ? { emoji, userId } : null
}

function parseList<T>(data: unknown, parse: (row: unknown) => T | null): T[] {
  if (!Array.isArray(data)) return []
  return data.flatMap(row => {
    const parsed = parse(row)
    return parsed === null ? [] : [parsed]
  })
}

export function parseWallPost(data: unknown): WallPost | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const author = parseAuthor(row.author)
  const organizationId = text(row.organizationId)
  const createdAt = text(row.createdAt)
  if (!id || !author || !organizationId || !createdAt) return null

  return {
    id,
    author,
    organizationId,
    // Never null, and never dropped for being unreadable: the API defaults an
    // unclassified Post to `community` on both write and read, so a value this
    // build does not know reads as the open case rather than as a sixth kind
    // nothing has a label or a colour for.
    kind: oneOf(row.kind, wallPostKinds) ?? 'community',
    title: text(row.title),
    endsAt: text(row.endsAt),
    pinnedAt: text(row.pinnedAt),
    body: text(row.body),
    attachments: parseList(row.attachments, parseWallAttachment),
    link: parseWallLink(row.link),
    reactions: parseList(row.reactions, parseReaction),
    score: optionalNumber(row.score) ?? 0,
    upvoteCount: optionalNumber(row.upvoteCount) ?? 0,
    viewCount: optionalNumber(row.viewCount) ?? 0,
    isBookmarked: flag(row.isBookmarked),
    editedAt: text(row.editedAt),
    createdAt,
  }
}

/** A page of Posts. A row this client cannot read is dropped, never the page. */
export function parseWallPosts(data: unknown): WallPost[] | null {
  if (!Array.isArray(data)) return null
  return parseList(data, parseWallPost)
}

/** A takedown or delete's answer: nothing about a soft-removed Post is worth reading but its id. */
export function parseWallPostRemoval(data: unknown): { id: string } | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  return id ? { id } : null
}

/**
 * One grant, read back from `GET /wall-contributors/:organizationId/:userId`.
 *
 * Used only against the viewer's own id, to decide whether the Compose
 * control offers an organization at all — see
 * `lib/use-composable-wall-organizations`. `isContributor` falls back to
 * `false` rather than dropping the whole row: a malformed boolean is a
 * Contributor question this device cannot answer yes to.
 */
export function parseWallContributorGrant(
  data: unknown,
): { userId: string; organizationId: string; isContributor: boolean } | null {
  const row = asRecord(data)
  if (!row) return null

  const userId = text(row.userId)
  const organizationId = text(row.organizationId)
  if (!userId || !organizationId) return null

  return { userId, organizationId, isContributor: row.isContributor === true }
}

/**
 * A named Wall — the definition a shared link resolves through.
 *
 * `organizationIds` falls back to an empty list rather than failing the whole
 * row: the API sends that same empty list for a reader in none of a Wall's
 * organizations, and a name with nothing else to read is still enough for a
 * shared link to render. `ownerId`, `createdAt` and `updatedAt` are
 * deliberately not read — nothing on this device offers to rename, re-scope,
 * or delete a Wall, so nothing here would ever use them.
 */
export function parseNamedWall(data: unknown): NamedWall | null {
  const row = asRecord(data)
  if (!row) return null

  const id = text(row.id)
  const name = text(row.name)
  if (!id || !name) return null

  const organizationIds = Array.isArray(row.organizationIds)
    ? row.organizationIds.filter((value): value is string => typeof value === 'string')
    : []

  return { id, name, organizationIds }
}
