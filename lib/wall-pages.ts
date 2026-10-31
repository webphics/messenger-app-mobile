import type { WallPost } from '@/lib/types'

/**
 * The pages of a Wall this device has read: the Posts drawn, where the next
 * page starts, and whether there is one.
 *
 * Deliberately not called a feed. `CONTEXT.md` lists Feed among the words a
 * **Wall** is not to be called, and a type named for the avoided synonym is how
 * that drifts back in.
 *
 * Pure, and the whole of what paging a Wall decides — so the questions that
 * matter are a table rather than something only a running API can demonstrate:
 * what a first page does to what is already drawn, what an older page does,
 * what happens when the same Post arrives twice, and when there is nothing
 * further back to ask for.
 *
 * The Wall pages *backwards* and only backwards. The API answers newest first
 * and takes the id of the last Post as the cursor for what comes after it, so
 * this holds that id rather than an offset: a Post published while somebody
 * reads page three cannot shift page four underneath them.
 *
 * Nothing here is a Delivery state and nothing here is an Outbox. A Post is
 * published rather than sent, so a Wall has no unsent half to fold in — which
 * is the difference between this and `lib/thread-state`, and the reason the two
 * look nothing alike despite both paging a list backwards.
 */

export type WallPages = {
  /** Newest first, as the API orders them, with no Post drawn twice. */
  posts: WallPost[]
  /**
   * The id the next page starts after, or null when the Wall has not been read.
   *
   * The last Post of the last page, rather than of the list: the two agree
   * today and would differ the moment something is folded in out of order.
   */
  cursor: string | null
  /** True once a page came back short, which is how the API says that was the end. */
  reachedEnd: boolean
}

export const emptyWall: WallPages = { posts: [], cursor: null, reachedEnd: false }

/** Keeps the first occurrence of each id, in the order given. */
function withoutDuplicates(posts: WallPost[]): WallPost[] {
  const seen = new Set<string>()
  return posts.filter(post => {
    if (seen.has(post.id)) return false
    seen.add(post.id)
    return true
  })
}

/**
 * A page short of the limit is the end of the Wall.
 *
 * A page *at* the limit is not, even when it happens to be the last one: the
 * API cannot say so, and the honest answer is one more request that comes back
 * empty rather than a "Load more" that was silently right or wrong.
 */
function isLastPage(page: WallPost[], limit: number): boolean {
  return page.length < limit
}

/**
 * The first page of a Wall: what came back replaces what was drawn.
 *
 * A refresh is a first page, which is why this replaces rather than merges. A
 * Post taken down between two reads has to leave the screen, and a merge is
 * exactly what would keep it there.
 */
export function applyFirstPage(page: WallPost[], limit: number): WallPages {
  const posts = withoutDuplicates(page)
  return {
    posts,
    cursor: posts.at(-1)?.id ?? null,
    reachedEnd: isLastPage(page, limit),
  }
}

/**
 * A page from further back, appended under what is already drawn.
 *
 * Duplicates are dropped rather than appended: a Post can legitimately arrive on
 * two pages when one is published between the two requests, and drawing it twice
 * is the visible bug. The cursor still moves to the end of the page that
 * arrived, duplicate or not — it is where the API got to, not where this list
 * did.
 */
export function applyOlderPage(read: WallPages, page: WallPost[], limit: number): WallPages {
  return {
    posts: withoutDuplicates([...read.posts, ...page]),
    cursor: page.at(-1)?.id ?? read.cursor,
    reachedEnd: isLastPage(page, limit),
  }
}

/**
 * Whether there is a page worth asking for.
 *
 * A Wall nobody has read yet is not one of them: its first page is a different
 * request, with a different spinner, and asking for it from here would show the
 * end of a list that has no beginning.
 */
export function canPageBack(read: WallPages): boolean {
  return read.cursor !== null && !read.reachedEnd
}

/**
 * A Post that just arrived, placed above everything already drawn.
 *
 * Newest first is the Wall's whole order, and an arrival over the socket is by
 * definition the newest thing the API knows about — so it goes on top rather
 * than wherever `createdAt` would sort it, which is what keeps the list correct
 * even when this device's clock disagrees with the server's. A copy already
 * held — this device's own Post read back, or the same event delivered twice —
 * is replaced in place rather than duplicated, but still moves to the top: a
 * repeat of a live arrival is still the newest thing this device has been told
 * about.
 *
 * Never touches the cursor. Cursor and `reachedEnd` describe how far back this
 * device has paged, which a Post landing at the front changes nothing about.
 */
export function withLivePost(read: WallPages, post: WallPost): WallPages {
  return { ...read, posts: [post, ...read.posts.filter(existing => existing.id !== post.id)] }
}

/**
 * An edit or a reaction, folded into the Post already on screen.
 *
 * Replaces in place and never reorders — an edited Post staying exactly where
 * it was is what lets `withLivePost` above be the only thing that moves a row,
 * and what a Post's own card relies on to say "Edited" against a position the
 * reader already knows.
 *
 * Never adds the Post: one this device has not read is not "on screen to
 * update", and a page further back is not something an edit should reach into
 * and pull forward.
 */
export function withUpdatedPost(read: WallPages, post: WallPost): WallPages {
  if (!read.posts.some(existing => existing.id === post.id)) return read
  return { ...read, posts: read.posts.map(existing => (existing.id === post.id ? post : existing)) }
}

/**
 * The same fold, for a Post that arrived over the socket rather than as an
 * answer to something this reader asked for.
 *
 * Two fields on a Post are the reader's own and are not in what the API
 * broadcasts to an organization's room: `isBookmarked`, which is private to
 * whoever saved it, and `viewCount`, which no broadcast carries because
 * recording a view raises none. `WallPost` says so on both. `parseWallPost`
 * cannot leave them out — the type has no room for absent — so it reads them
 * as `false` and `0`, which is the honest answer to "the payload did not say"
 * and the wrong one to fold over a Post already on screen.
 *
 * So a broadcast updates what it actually knows and keeps what only this
 * device does. Without it, somebody else reacting to a Post you had saved
 * emptied the star and zeroed the count with no request having failed — and
 * the tap that followed sent a toggle, which un-saved it for real. The same
 * carve-out already exists for a vote, which is held outside the Post for
 * exactly this reason.
 */
export function withBroadcastPost(read: WallPages, post: WallPost): WallPages {
  const held = read.posts.find(existing => existing.id === post.id)
  if (!held) return read
  return withUpdatedPost(read, {
    ...post,
    isBookmarked: held.isBookmarked,
    viewCount: held.viewCount,
  })
}

/**
 * A Post deleted or taken down. Simply absent, the way a Post never drawn is.
 */
export function withoutLivePost(read: WallPages, postId: string): WallPages {
  if (!read.posts.some(existing => existing.id === postId)) return read
  return { ...read, posts: read.posts.filter(existing => existing.id !== postId) }
}

/**
 * The Saved view's own rollback: an un-bookmark the API refused, put back at
 * the index its row held before the tap removed it.
 *
 * Not `withLivePost` — that is an arrival, and always goes to the top; this
 * restores a position rather than reporting news, because the row's absence
 * from the Saved view was the only thing the tap changed. Never duplicates: a
 * Post already back (a second refusal answering after a retry already put it
 * there) is left exactly where it is rather than inserted again.
 */
export function withRestoredPost(read: WallPages, post: WallPost, index: number): WallPages {
  if (read.posts.some(existing => existing.id === post.id)) return read
  const posts = [...read.posts]
  posts.splice(Math.min(Math.max(index, 0), posts.length), 0, post)
  return { ...read, posts }
}

/**
 * The Wall without the Posts of people the reader blocked.
 *
 * Applied to what is *drawn* rather than written into what was read, so the
 * cursor stays the last Post the API answered with — paging on from a Post
 * this filtered out would otherwise ask for the page after the wrong one — and
 * so an unblock brings the Posts back without a request. The API leaves them
 * out of every page it answers from the block onwards; this is what takes down
 * the ones already on the screen, and the live ones the socket broadcasts to the
 * whole Organization room. Hands back the same object when nothing is hidden,
 * so a memoised list does not re-render for a block of somebody absent.
 */
export function withoutAuthors(read: WallPages, authorIds: ReadonlySet<string>): WallPages {
  if (authorIds.size === 0 || !read.posts.some(post => authorIds.has(post.author.id))) return read
  return { ...read, posts: read.posts.filter(post => !authorIds.has(post.author.id)) }
}
