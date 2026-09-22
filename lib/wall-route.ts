import type { Href } from 'expo-router'

/** Segments under `/wall/` that are routes rather than a named Wall's id. */
const WALL_STATIC_SEGMENTS = ['saved', 'post']

/**
 * A shared, named Wall — opened from a link somebody else made and handed
 * around. Beside the chat and community routes rather than under a role's
 * tabs, for the same reason those are: it is reached from outside whatever
 * screen was on top when the link was tapped, and every role opens the same
 * screen (`docs/api/wall.md`'s reading rule draws no line between them).
 *
 * Authoring a Wall — creating, renaming, re-scoping, deleting — stays on web;
 * this app only ever has an id to read through.
 */
export function sharedWallHref(id: string): Href {
  return { pathname: '/wall/[id]', params: { id } }
}

/**
 * One Post on its own screen — where a card that is not the Post itself leads.
 *
 * A sibling of `/wall/saved` rather than a segment under `/wall/[id]`: that
 * route is a named Wall, and a Post never belongs to one, so `/wall/post/:id`
 * is its own static prefix ahead of the dynamic id beside it — the same
 * arrangement `chat/details/:id` has next to `chat/:id`.
 *
 * Reached from the Customer Hub's carousel, which draws a Post small and has
 * nowhere to put what a Post can actually be done to.
 */
export function wallPostHref(id: string): Href {
  // Cast, as `lib/hub-routes` does throughout: the generated route types are
  // written by Metro, so a route added since the last bundle is not in them yet
  // and a fresh checkout would not typecheck until somebody had started the app.
  return { pathname: '/wall/post/[id]', params: { id } } as unknown as Href
}

/**
 * The Saved view: this person's own bookmarked Posts (#84). A sibling of the
 * shared-Wall route rather than a segment under it — `/wall/saved` is a
 * static path Expo Router resolves ahead of the dynamic `/wall/:id` beside
 * it, the same way `chat/details/:id` sits beside `chat/:id` rather than
 * under it — and it carries no id: there is exactly one Saved view, this
 * caller's own.
 */
export function wallSavedHref(): Href {
  return '/wall/saved'
}

/**
 * Resolve `/wall/:id` from search params or the pathname.
 *
 * The same reader every other dynamic route in this app has, and for the same
 * reason: params are often empty after a Metro reload, and the pathname is
 * what is left. See `lib/community-route`.
 */
export function sharedWallIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams

  const parts = pathname.split('/').filter(Boolean)
  // `saved` and `post` are static routes under the same prefix, so neither is
  // ever a Wall id — without this, `/wall/post/<id>` reads as the named Wall
  // `post` the moment params come back empty after a Metro reload.
  if (parts[0] === 'wall' && parts[1] && parts[1] !== '[id]' && !WALL_STATIC_SEGMENTS.includes(parts[1])) {
    return decodeURIComponent(parts[1])
  }
  return undefined
}

/**
 * Resolve `/wall/post/:id` from search params or the pathname.
 *
 * The same reader `sharedWallIdFromRoute` is, and it exists separately for the
 * one reason that matters: both routes live under `/wall`, so a walk that only
 * looked for the segment after `wall` would read `post` as a Wall id the moment
 * params came back empty after a Metro reload.
 */
export function wallPostIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams

  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'wall' && parts[1] === 'post' && parts[2] && parts[2] !== '[id]') {
    return decodeURIComponent(parts[2])
  }
  return undefined
}
