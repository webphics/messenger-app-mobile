import { asRecord } from '@/lib/api-envelope'
import { wallPostKinds } from '@/lib/types'
import type { MessageWallPost, WallPost, WallPostKind } from '@/lib/types'

/**
 * A Reply to a Post as a message carries it (`CONTEXT.md`): the Post's id, and
 * a snapshot of it for the card a bubble draws. Pure, so the three decisions a
 * card makes — what a payload means, what a waiting Post becomes, and which
 * words lead — are table-tested rather than read off a screen.
 */

/** As long as the API's snapshot keeps (`MESSAGE_WALL_POST_EXCERPT_MAX`). */
const EXCERPT_MAX = 200

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The `wallPost` on a message, or null for none.
 *
 * Null for anything it cannot use — no id, no organization, no publish time —
 * rather than a card with a hole in it: a reference that cannot be opened is
 * not one. A kind this build does not know reads as `community`, the open case,
 * the way `parseWallPost` reads it, and a missing author is named generically
 * rather than dropping the card.
 */
export function parseMessageWallPost(value: unknown): MessageWallPost | null {
  const record = asRecord(value)
  if (!record) return null

  const id = text(record.id)
  const organizationId = text(record.organizationId)
  const postedAt = text(record.postedAt)
  if (!id || !organizationId || !postedAt) return null

  const kind = (wallPostKinds as readonly string[]).includes(record.kind as string)
    ? (record.kind as WallPostKind)
    : 'community'

  return {
    id,
    organizationId,
    kind,
    authorName: text(record.authorName) ?? 'Someone',
    title: text(record.title),
    excerpt: text(record.excerpt),
    imageUrl: text(record.imageUrl),
    postedAt,
  }
}

/**
 * The reference a message will carry, built from the Post waiting in the
 * composer, so the card on the bubble this phone puts up before the API answers
 * is the card the API's copy will draw. Mirrors the API's snapshot: the first
 * image stands for the Post and the body is cut to the excerpt's length. The
 * author is whoever this reader is shown, which for a Customer — the only reader
 * offered Reply — is already the company for a Staff author.
 */
export function wallPostReferenceFromPost(post: WallPost): MessageWallPost {
  const body = post.body?.trim()
  const image = post.attachments.find((attachment) => attachment.kind === 'image')

  return {
    id: post.id,
    organizationId: post.organizationId,
    kind: post.kind,
    authorName: post.author.name,
    title: post.title?.trim() || null,
    excerpt: body ? body.slice(0, EXCERPT_MAX) : null,
    imageUrl: image?.url ?? null,
    postedAt: post.createdAt,
  }
}

/**
 * The card's two lines of text. A title leads when there is one and the
 * excerpt follows it; with no title the excerpt leads alone; and a Post with
 * neither — an image and nothing else — is named by its author, so the card
 * never shows a blank headline.
 */
export function wallPostReferenceText(reference: MessageWallPost): {
  headline: string
  detail: string | null
} {
  const title = reference.title?.trim()
  const excerpt = reference.excerpt?.trim() || null

  if (title) return { headline: title, detail: excerpt }
  if (excerpt) return { headline: excerpt, detail: null }
  return { headline: `Post by ${reference.authorName}`, detail: null }
}
