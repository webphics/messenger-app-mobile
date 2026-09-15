import type { WallPost, WallPostAttachment, WallPostReaction } from '@/lib/types'

/**
 * What a Post's card is made of, decided before anything is drawn.
 *
 * All of it pure, because every one of these is a case somebody can get wrong
 * and none of them needs a screen to demonstrate: which collage four images
 * take, where a link button actually goes, whether a body is long enough to be
 * worth clamping, and how a Post reads to somebody who cannot see it.
 *
 * The one rule underneath the collage is that a card must not move while it
 * loads. Each shape carries the aspect ratio it occupies, so the space is taken
 * before a single image has decoded — a Post never grows under the reader's
 * thumb halfway down a Wall.
 */

/** The three kinds of attachment a Post can carry, split in one pass. */
export function groupWallAttachments(attachments: WallPostAttachment[]): {
  images: WallPostAttachment[]
  videos: WallPostAttachment[]
  documents: WallPostAttachment[]
} {
  const images: WallPostAttachment[] = []
  const videos: WallPostAttachment[] = []
  const documents: WallPostAttachment[] = []

  for (const attachment of attachments) {
    if (attachment.kind === 'image') images.push(attachment)
    else if (attachment.kind === 'video') videos.push(attachment)
    else documents.push(attachment)
  }

  return { images, videos, documents }
}

/** The shapes an image collage takes, one per count a Post can carry. */
export type WallCollageKind = 'single' | 'pair' | 'feature' | 'quad'

export type WallCollage = {
  kind: WallCollageKind
  /** The images the collage draws, in the order the author attached them. */
  visible: WallPostAttachment[]
  /** How many sit behind the last cell's `+N` rather than being drawn. */
  overflowCount: number
  /** Width over height of the whole collage, so its height is known up front. */
  aspectRatio: number
}

/** How many cells a collage draws before the rest collapse into the last one's `+N`. */
export const WALL_COLLAGE_MAX_CELLS = 4

const ASPECT_RATIO: Record<WallCollageKind, number> = {
  single: 4 / 3,
  pair: 2,
  feature: 3 / 2,
  quad: 1,
}

/**
 * Which collage a Post's images get, decided by how many there are.
 *
 * Four shapes rather than one responsive grid, because the interesting cases are
 * not a sequence: two images want equal halves, three want one feature beside a
 * stack, and five want four cells and a count. The caller turns the kind into a
 * grid; this decides which kind, which images are drawn, and how much height the
 * card gives them before any of it has loaded.
 */
export function wallCollage(images: WallPostAttachment[]): WallCollage | null {
  if (images.length === 0) return null

  const kind: WallCollageKind =
    images.length === 1
      ? 'single'
      : images.length === 2
        ? 'pair'
        : images.length === 3
          ? 'feature'
          : 'quad'

  return {
    kind,
    visible: images.slice(0, WALL_COLLAGE_MAX_CELLS),
    overflowCount: Math.max(0, images.length - WALL_COLLAGE_MAX_CELLS),
    aspectRatio: ASPECT_RATIO[kind],
  }
}

/**
 * The host a link button goes to, for rendering under its label.
 *
 * A Post's link carries a label its author chose, and a label is free text: the
 * reader has to be able to see where it actually goes before they press it. The
 * `www.` is dropped because it distinguishes nothing, and a URL this cannot read
 * falls back to the raw string — a destination nobody can parse is still better
 * than a button that hides one.
 */
export function linkHost(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim())
  const authority = match?.[1]
  if (!authority) return url.trim()
  const host = authority.split('@').pop() ?? authority
  return host.replace(/:\d+$/, '').replace(/^www\./i, '')
}

/**
 * How many lines a collapsed body shows.
 *
 * Eight is roughly two thirds of the 500-character ceiling at a phone's column
 * width, so the longest Post a Contributor can write still shows enough to
 * decide by, and a Post of two lines never carries a control it does not need.
 */
export const WALL_BODY_CLAMP_LINES = 8

/**
 * How long a body can be before it stops being a statement and starts being a
 * paragraph — the point at which a Post with no images above it stops being set
 * a step larger.
 */
export const WALL_BODY_LEAD_MAX = 140

/**
 * How a body is set: as something somebody said, or as something to read.
 *
 * A line of text alone in a card at reading size reads as a record with a field
 * in it. Given nothing above it to carry the card, a short body is set larger so
 * that one word and five hundred characters both look deliberate rather than
 * like the same template with more in it.
 *
 * A Post with no images is not a dead case, though `CONTEXT.md` says a Post
 * leads with an image: the API refuses to *create* one without, and every Post
 * written before that rule stays readable. They are on the Wall today, and this
 * is the branch that draws them as something somebody said.
 */
export function wallBodyEmphasis(body: string, hasImages: boolean): 'lead' | 'body' {
  return !hasImages && body.trim().length <= WALL_BODY_LEAD_MAX ? 'lead' : 'body'
}

/**
 * Whether this device should ask the API to record a view of this Post.
 *
 * Two of the three rules the API itself would apply anyway — the author's own
 * view is never counted, and a second call from the same person changes
 * nothing — are checked here first so a screen never spends a request on an
 * answer it can already read locally. `recorded` is per-session state the
 * caller owns (never persisted: a Wall keeps nothing of its own across a
 * relaunch, see `lib/use-wall`'s module doc), so a Post scrolled past twice in
 * one sitting is asked about once.
 */
export function shouldRecordWallPostView(
  post: WallPost,
  viewerId: string,
  recorded: ReadonlySet<string>,
): boolean {
  return post.author.id !== viewerId && !recorded.has(post.id)
}

/** One emoji, gathered for the reaction row: how many hold it, and whether the viewer is one of them. */
export type WallReactionChip = { emoji: string; count: number; mine: boolean }

/**
 * A Post's reactions, gathered per emoji for the chip row.
 *
 * The API sends them one per person per emoji — `{ emoji, userId }` — the same
 * shape a Message's reactions arrive in, so the grouping happens here for the
 * same reason `groupReactions` (`lib/message-react`) exists: a card draws one
 * chip per emoji with a count, not one row per person who reacted.
 *
 * Order is first-appearance, which is what keeps the row from reshuffling as
 * reactions arrive — the same property `groupReactions` keeps for a Message.
 */
export function wallReactionChips(
  reactions: WallPostReaction[],
  viewerId: string,
): WallReactionChip[] {
  const order: string[] = []
  const counts = new Map<string, number>()
  const mine = new Set<string>()

  for (const reaction of reactions) {
    if (!counts.has(reaction.emoji)) order.push(reaction.emoji)
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1)
    if (reaction.userId === viewerId) mine.add(reaction.emoji)
  }

  return order.map((emoji) => ({ emoji, count: counts.get(emoji) ?? 0, mine: mine.has(emoji) }))
}
