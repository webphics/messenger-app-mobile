import type { WallAttachmentKind } from '@/lib/types'

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

export type WallComposeInput = {
  /** Whether an organization has been chosen — never inferred, only asked for or defaulted to the one the Contributor has. */
  hasOrganization: boolean
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

  return {
    organization: input.hasOrganization ? null : 'Choose an organization to post to.',
    attachment: wallComposeHasImage(input.attachmentKinds)
      ? null
      : 'Attach at least one image to publish this post.',
    link: Boolean(label) !== Boolean(url) ? 'A link button needs both a label and a URL.' : null,
  }
}

export function hasWallComposeError(errors: WallComposeErrors): boolean {
  return errors.organization !== null || errors.attachment !== null || errors.link !== null
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
