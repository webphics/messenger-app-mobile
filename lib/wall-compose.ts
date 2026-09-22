import type { WallAttachmentKind, WallPostKind } from '@/lib/types'

/**
 * What a Compose submit checks before anything is sent.
 *
 * Mirrors the web client's inline validation in `ComposeWallPostDialog`, one
 * step ahead of the API's own refusals (`CreateWallPostSchema`'s `.refine` for
 * the image, `.strict()` for everything else) so a Contributor finds out
 * before a request rather than after one. Pure: what a submit has staged is
 * three plain facts, and every one of these questions is answerable from them
 * alone.
 */

/** The API's own ceiling on a Post's link label (`WALL_POST_LINK_LABEL_MAX`). */
export const WALL_POST_LINK_LABEL_MAX = 30

/** The API's own ceiling on a Post's attachments (`WALL_POST_ATTACHMENT_MAX`). */
export const WALL_POST_ATTACHMENT_MAX = 10

/** The API's own ceiling on a Post's title (`WALL_POST_TITLE_MAX`). */
export const WALL_POST_TITLE_MAX = 80

export const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * The deadlines Compose offers, as durations from now.
 *
 * Durations rather than a date picker: a phone's date-and-time picker is two
 * modal screens to say "this weekend", and an offer's end is nearly always a
 * round span from the moment it is posted. A date somebody must have exactly is
 * the case this does not serve, and it is the rarer one — web has the full
 * picker, and this list is the set worth two taps.
 */
export const WALL_DEADLINE_CHOICES: readonly { label: string; ms: number }[] = [
  { label: '24 hours', ms: DAY_MS },
  { label: '3 days', ms: 3 * DAY_MS },
  { label: '1 week', ms: 7 * DAY_MS },
  { label: '30 days', ms: 30 * DAY_MS },
]

/**
 * The kinds that must carry a title, mirroring `CreateWallPostSchema`'s refine.
 * Everything but a community Post announces something, and the thing it
 * announces needs a name; a community Post is a remark and does not.
 */
export function wallKindNeedsTitle(kind: WallPostKind): boolean {
  return kind !== 'community'
}

/**
 * The kinds that may carry a deadline (`wallPostKindsWithDeadline`). A promotion
 * and a giveaway both end, and when they end is what makes a reader act now; a
 * Post nothing happens to cannot end, and the API refuses a date on one.
 */
export function wallKindAllowsDeadline(kind: WallPostKind): boolean {
  return kind === 'promotion' || kind === 'giveaway'
}

export type WallComposeInput = {
  /** Whether an organization has been chosen — never inferred, only asked for or defaulted to the one the Contributor has. */
  hasOrganization: boolean
  /** What the Post is for. Decides whether a title is required and a deadline allowed. */
  kind: WallPostKind
  title: string
  /** The chosen deadline as milliseconds since the epoch, or null for none. */
  endsAt: number | null
  /** Read once by the caller so the same submit cannot judge two different "now"s. */
  now: number
  /** The kind of every attachment staged so far. */
  attachmentKinds: readonly WallAttachmentKind[]
  linkLabel: string
  linkUrl: string
}

export type WallComposeErrors = {
  organization: string | null
  /** Named for what the field shows on screen — the missing-image rule lives here, not a separate flag. */
  attachment: string | null
  link: string | null
  title: string | null
  endsAt: string | null
}

/**
 * A Post leads with an image, the way a feed post does: video and documents
 * may ride along beside one, but neither satisfies this on its own, and
 * there is no text-only or video-only Post (`CreateWallPostSchema`'s refine).
 */
export function wallComposeHasImage(kinds: readonly WallAttachmentKind[]): boolean {
  return kinds.includes('image')
}

/**
 * The three things a submit can be wrong about, all at once — so every
 * field's complaint appears together rather than one at a time across
 * repeated taps of Post.
 */
export function wallComposeErrors(input: WallComposeInput): WallComposeErrors {
  const label = input.linkLabel.trim()
  const url = input.linkUrl.trim()

  const title = input.title.trim()

  return {
    organization: input.hasOrganization ? null : 'Choose an organization to post to.',
    attachment: wallComposeHasImage(input.attachmentKinds)
      ? null
      : 'Attach at least one image to publish this post.',
    link: Boolean(label) !== Boolean(url) ? 'A link button needs both a label and a URL.' : null,
    title:
      wallKindNeedsTitle(input.kind) && title === ''
        ? 'This kind of post needs a title.'
        : title.length > WALL_POST_TITLE_MAX
          ? `A title is at most ${WALL_POST_TITLE_MAX} characters.`
          : null,
    // A deadline already past is not a deadline, and the API judges it at the
    // moment it arrives — so a sheet left open past the date it chose is caught
    // here rather than by a refusal the author cannot act on.
    endsAt:
      input.endsAt === null
        ? null
        : !wallKindAllowsDeadline(input.kind)
          ? 'Only a promotion or a giveaway can have an end date.'
          : input.endsAt <= input.now
            ? 'The end date must be in the future.'
            : null,
  }
}

export function hasWallComposeError(errors: WallComposeErrors): boolean {
  return Object.values(errors).some(error => error !== null)
}

/**
 * Whether the organization has to be asked for at all.
 *
 * A Contributor of exactly one organization is never asked — there is
 * nothing to choose between — but more than one means an explicit choice
 * with no inferred default, which is the acceptance criterion this answers.
 */
export function wallComposeNeedsOrganizationChoice(organizationCount: number): boolean {
  return organizationCount > 1
}

/**
 * The organization a fresh Compose form starts on: the Contributor's only
 * one, or nothing when there is a real choice to make.
 */
export function wallComposeDefaultOrganization<T extends { id: string }>(
  organizations: readonly T[],
): string | null {
  return organizations.length === 1 ? (organizations[0]?.id ?? null) : null
}
