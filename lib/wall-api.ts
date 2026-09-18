import { query, readOutcome, type ApiResult } from '@/lib/api-result'
import { authenticatedRequest } from '@/lib/auth-service'
import { UNSUPPORTED_TYPE_MESSAGE, uploadMimeType } from '@/lib/attachment-upload'
import {
  parseNamedWall,
  parseWallAttachment,
  parseWallContributorGrant,
  parseWallPost,
  parseWallPostRemoval,
  parseWallPosts,
} from '@/lib/wall-parse'
import type {
  AttachmentView,
  NamedWall,
  WallPost,
  WallPostAttachment,
  WallPostKind,
  WallPostLink,
  WallSort,
  WallVoteDirection,
} from '@/lib/types'

/**
 * The Wall endpoints, over the one transport this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds paths, not a second way of talking to the API.
 */

/**
 * The most Posts one page may hold. The API refuses anything above a hundred
 * and defaults to fifty; this names the number rather than letting the default
 * decide, because `applyFirstPage` reads a short page as the end of the Wall
 * and has to be comparing against the number that was actually asked for.
 */
export const WALL_PAGE_LIMIT = 20

/**
 * A page of a Wall, newest first.
 *
 * No `wall` parameter is the default Wall, which the API resolves at read time
 * to every organization the reader belongs to. There is no value that asks for
 * a wider set than one's own memberships, so a Customer, an Agent and an Admin
 * all read this same path and each receives their own.
 *
 * `wall` reads a named Wall instead — the same organizations, intersected with
 * that Wall's own. A Wall naming only organizations this reader is not in
 * answers an empty page rather than a refusal, and a Wall that does not exist
 * (deleted, or never did) answers `wall_not_found`, which surfaces here as an
 * ordinary `refused` failure — a shared link that is simply broken.
 *
 * `cursor` is the id of the last Post on the previous page, never an offset.
 *
 * `sort` chooses the order: `recent` (the default) or `popular`. Left
 * undefined for `recent` rather than sent explicitly, so a Recent read is the
 * exact request this app has always made — the API says the two are
 * byte-identical, but there is no reason to depend on that when omitting the
 * parameter is free. A `popular` cursor is only ever valid against a
 * `popular` read of the same Wall scope; nothing here enforces that, which is
 * why `lib/use-wall` resets its held pages rather than reusing a cursor
 * across a sort switch.
 */
export async function listWallPosts(
  params: {
    cursor?: string
    limit?: number
    sort?: WallSort
    wall?: string
    /**
     * Narrow the Wall to one kind. Absent is every kind, which is what this
     * client sent before it knew kinds existed — so the unfiltered read is
     * byte-identical to what it always was.
     */
    kind?: WallPostKind
  } = {},
): Promise<ApiResult<WallPost[]>> {
  const outcome = await authenticatedRequest(
    `/wall/posts${query({
      wall: params.wall,
      sort: params.sort === 'popular' ? 'popular' : undefined,
      kind: params.kind,
      cursor: params.cursor,
      limit: params.limit ?? WALL_PAGE_LIMIT,
    })}`,
  )
  return readOutcome(outcome, parseWallPosts)
}

/**
 * The most Posts one page of a search result may hold. Its own constant
 * rather than reusing `WALL_PAGE_LIMIT`: search is a sibling endpoint with its
 * own default and its own ceiling on the API side (`SearchWallPostsQuerySchema`),
 * and nothing requires the two to move together if either changes.
 */
export const WALL_SEARCH_PAGE_LIMIT = 20

/**
 * A Post `q` could find — matched against a Post's body and its author's name
 * — scoped exactly the way `listWallPosts` scopes a read: search is never a
 * second way to see a Post the reader's own Wall could not otherwise show
 * them. `wall` narrows to a named Wall's organizations the same way it does
 * there; `cursor` pages a result the same way, the id of the last Post on the
 * previous page.
 *
 * A blank `q` is refused by the API (`SearchWallPostsQuerySchema`, `min(1)`);
 * this app never sends one — `lib/use-wall`'s search only runs once somebody
 * has typed something.
 */
export async function searchWallPosts(
  params: { q: string; wall?: string; cursor?: string; limit?: number },
): Promise<ApiResult<WallPost[]>> {
  const outcome = await authenticatedRequest(
    `/wall/posts/search${query({
      q: params.q,
      wall: params.wall,
      cursor: params.cursor,
      limit: params.limit ?? WALL_SEARCH_PAGE_LIMIT,
    })}`,
  )
  return readOutcome(outcome, parseWallPosts)
}

/**
 * One Post by id — what a permalink resolves through.
 *
 * Scoped server-side exactly as a page of the Wall is: a Post in an
 * organization this reader is not in answers `refused` rather than arriving,
 * so nothing here is a second way to see a Post the Wall itself would not
 * show. A Post that has been taken down is gone rather than empty, which is
 * why the screen that reads this tells the two apart.
 */
export async function getWallPost(postId: string): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}`)
  return readOutcome(outcome, parseWallPost)
}

/**
 * One named Wall by id — the route a shared link resolves through, whether or
 * not this reader owns it.
 *
 * `organizationIds` on the answer already comes back narrowed to what this
 * reader may see (`lib/wall-parse`), so nothing here intersects anything a
 * second time: a Wall naming organizations this reader is not in still answers
 * with a name to show, and an empty `organizationIds` rather than a refusal.
 * This app only ever reads a Wall's definition for that name — creating,
 * renaming, re-scoping, and deleting one all stay on web.
 */
export async function getNamedWall(wallId: string): Promise<ApiResult<NamedWall>> {
  const outcome = await authenticatedRequest(`/wall/walls/${encodeURIComponent(wallId)}`)
  return readOutcome(outcome, parseNamedWall)
}

/**
 * Toggles the caller's own reaction with one exact emoji on a Post.
 *
 * One route, not an add/remove pair — the API decides on/off from whatever
 * this caller already holds and answers with the Post as it now stands, which
 * is how "whether a tap resolved to an add or a remove is read off the
 * answer" is satisfied rather than assumed here. The caller (`lib/use-wall`)
 * works out what to draw optimistically; this only carries the request.
 *
 * Named apart from `toggleWallPostReaction` (`lib/wall-actions`, the pure
 * reducer over the optimistic patch) rather than sharing it: one sends a
 * request, the other decides what a tap means, and a shared name would read
 * as though this function decided anything.
 */
export async function reactToWallPost(
  postId: string,
  emoji: string,
): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(
    `/wall/posts/${encodeURIComponent(postId)}/reactions`,
    { method: 'POST', body: { emoji } },
  )
  return readOutcome(outcome, parseWallPost)
}

/**
 * Records the caller's own view of a Post — at most once per person, ever.
 *
 * No body, and idempotent by design (`docs/api/wall.md`): a repeat call from
 * somebody who has already viewed this Post costs one indexed lookup and
 * answers with the Post unchanged, so nothing here needs to track "have I
 * already asked the API this" — only "have I already asked it *this
 * session*" (`lib/wall-card`'s `shouldRecordWallPostView`), to avoid a
 * request for every re-render rather than to avoid a wrong count. Never
 * broadcast over realtime, so the only way this device's own `viewCount`
 * moves is the response to its own call.
 */
export async function recordWallPostView(postId: string): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}/view`, {
    method: 'POST',
  })
  return readOutcome(outcome, parseWallPost)
}

/**
 * The most bookmarked Posts one page of the Saved view may hold. Its own
 * constant rather than reusing `WALL_PAGE_LIMIT`: the Saved view is an
 * unrelated feed through a sibling endpoint, and nothing requires the two to
 * move together if either changes.
 */
export const WALL_BOOKMARKS_PAGE_LIMIT = 20

/**
 * This caller's own bookmarked Posts, newest saved first. Private —
 * `GET /wall/posts/bookmarks` answers for nobody but the person asking, and
 * this app never reads anybody else's.
 *
 * `cursor` is the id of the last Post on the previous page, exactly like
 * `listWallPosts`'s: the API pages a bookmark list on the *Post's* id it
 * resolved to, not the bookmark record's own, so every pure function in
 * `lib/wall-pages` that already pages a Wall applies here unchanged.
 */
export async function listWallBookmarks(
  params: { cursor?: string; limit?: number } = {},
): Promise<ApiResult<WallPost[]>> {
  const outcome = await authenticatedRequest(
    `/wall/posts/bookmarks${query({
      cursor: params.cursor,
      limit: params.limit ?? WALL_BOOKMARKS_PAGE_LIMIT,
    })}`,
  )
  return readOutcome(outcome, parseWallPosts)
}

/**
 * Toggles the caller's own bookmark on a Post. Gated like a single-Post read
 * (`WallPolicy.assertCanRead`), not like posting — the same rule
 * `reactToWallPost` and `voteOnWallPost` stand on, so a Contributor grant is
 * not needed to bookmark either. Private: never broadcast over realtime, and
 * nothing on a Post ever says how many people bookmarked it or who.
 */
export async function toggleWallPostBookmark(postId: string): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(
    `/wall/posts/${encodeURIComponent(postId)}/bookmark`,
    { method: 'POST' },
  )
  return readOutcome(outcome, parseWallPost)
}

/**
 * Casts or clears the caller's own vote on a Post. One route, not an
 * up/down/clear trio — the same toggle shape as `reactToWallPost`, gated the
 * same way, so a Contributor grant is not required to vote either.
 *
 * The response is the Post as it now stands, `score` and `upvoteCount`
 * included, but it never says which direction the caller now holds — the
 * API deliberately offers no way to read that back. `lib/use-wall` is what
 * tracks "my vote" and rolls it back on a refusal; this only carries the
 * request.
 */
export async function voteOnWallPost(
  postId: string,
  direction: WallVoteDirection,
): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}/vote`, {
    method: 'POST',
    body: { direction },
  })
  return readOutcome(outcome, parseWallPost)
}

/** What Compose sends: an audience, and everything a Post may carry. */
export type WallPostCreateInput = {
  organizationId: string
  /**
   * What the Post is for. Absent is `community` — the API's own default, and
   * what this client sent before it knew kinds existed.
   */
  kind?: WallPostKind
  /** Required server-side for every kind but `community`. */
  title?: string
  body?: string
  attachments?: WallPostAttachment[]
  link?: WallPostLink
  /** ISO 8601. Accepted only on `promotion` and `giveaway`, and only in the future. */
  endsAt?: string
}

/** The wire shape `CreateWallPostSchema` and `UpdateWallPostSchema` both take — `kind` back to `type`. */
function sendableWallAttachment(attachment: WallPostAttachment): Record<string, unknown> {
  return {
    type: attachment.kind,
    url: attachment.url,
    ...(attachment.fileName == null ? {} : { fileName: attachment.fileName }),
    ...(attachment.size == null ? {} : { size: attachment.size }),
  }
}

/**
 * A fresh Post. `organizationId` is the whole audience, set once here and
 * never revisited — there is no route that moves a Post to a different
 * organization (`CreateWallPostSchema`'s own comment says so).
 *
 * The image requirement is the API's (`.refine`, `wall_attachment_missing`)
 * and `lib/wall-compose` is the same rule one step earlier, where it can be
 * acted on; this sends whatever it is given and lets the refusal speak for
 * itself if that check was skipped.
 */
export async function createWallPost(input: WallPostCreateInput): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest('/wall/posts', {
    method: 'POST',
    body: {
      organizationId: input.organizationId,
      // Each omitted when absent rather than sent as null: `CreateWallPostSchema`
      // is `.strict()` and every one of these is `.optional()`, so an explicit
      // null is a refusal where an absent key is the default.
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.endsAt ? { endsAt: input.endsAt } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments.map(sendableWallAttachment) }
        : {}),
      ...(input.link ? { link: input.link } : {}),
    },
  })
  return readOutcome(outcome, parseWallPost)
}

/** The multipart field `FileInterceptor('file', …)` reads on the API. */
const WALL_UPLOAD_FIELD = 'file'

/**
 * One file this device holds, put into the API's object store ahead of the
 * Post that will carry it — `POST /wall/organizations/:organizationId/files`,
 * scoped to the organization being posted to because there is no Post id yet
 * to nest this under. Multipart and streamed from disk, exactly as
 * `uploadAttachment` (`lib/conversation-api`) does for a Message; see
 * `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`.
 *
 * A type the allowlist does not hold is refused before the upload rather
 * than after it, the same floor `uploadAttachment` stands on.
 */
export async function uploadWallFile(
  organizationId: string,
  attachment: AttachmentView,
): Promise<ApiResult<WallPostAttachment>> {
  const type = uploadMimeType(attachment)
  if (!type) {
    return { ok: false, failure: { kind: 'refused', message: UNSUPPORTED_TYPE_MESSAGE } }
  }

  const outcome = await authenticatedRequest(
    `/wall/organizations/${encodeURIComponent(organizationId)}/files`,
    { method: 'POST', file: { uri: attachment.uri, field: WALL_UPLOAD_FIELD, type } },
  )
  return readOutcome(outcome, parseWallAttachment)
}

/**
 * Whether the caller holds a Contributor grant for one organization.
 *
 * `GET /wall-contributors/:organizationId/:userId` is entirely Admin-only
 * server-side (`WallContributorsController`), so this only ever resolves for
 * an Admin asking about somebody else — never for the Contributor asking
 * about themselves, which answers `refused` rather than a real yes or no.
 * `lib/use-composable-wall-organizations` calls this against the viewer's own
 * id anyway, exactly as the web client's `useComposableWallOrganizations`
 * does, and reads a refusal the same way it reads "no grant": there is no
 * self-service "am I a Contributor anywhere" route to fall back to instead.
 */
export async function getWallContributorGrant(
  organizationId: string,
  userId: string,
): Promise<ApiResult<{ userId: string; organizationId: string; isContributor: boolean }>> {
  const outcome = await authenticatedRequest(
    `/wall-contributors/${encodeURIComponent(organizationId)}/${encodeURIComponent(userId)}`,
  )
  return readOutcome(outcome, parseWallContributorGrant)
}

/**
 * What an edit on this device may change: the body, and the link button.
 *
 * Deliberately not `attachments` — there is no picker wired into an edit yet,
 * so this app never sends the field at all, and the API leaves a Post's
 * attachments exactly as they were on any request that omits it
 * (`UpdateWallPostSchema`). `link: null` removes the link button; `link`
 * simply absent leaves it as it is, the same rule the API's own schema uses.
 */
export type WallPostEditInput = {
  body?: string
  link?: WallPostLink | null
}

/**
 * The author's own edit. No Admin exception on the API side
 * (`WallPolicy.assertCanEdit`), so a refusal here always means this caller is
 * not the author — `lib/wall-actions` is what keeps the control from being
 * offered to begin with.
 */
export async function updateWallPost(
  postId: string,
  input: WallPostEditInput,
): Promise<ApiResult<WallPost>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: input,
  })
  return readOutcome(outcome, parseWallPost)
}

/**
 * The author taking down their own Post, or an Admin taking down anyone's.
 * Soft on the API's side — the document survives for the record — so the
 * answer is only the id, never a Post this Wall will show again.
 */
export async function removeWallPost(postId: string): Promise<ApiResult<{ id: string }>> {
  const outcome = await authenticatedRequest(`/wall/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  })
  return readOutcome(outcome, parseWallPostRemoval)
}
