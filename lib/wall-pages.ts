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
