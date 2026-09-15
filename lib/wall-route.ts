import type { Href } from 'expo-router'

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
  if (parts[0] === 'wall' && parts[1] && parts[1] !== '[id]') {
    return decodeURIComponent(parts[1])
  }
  return undefined
}
