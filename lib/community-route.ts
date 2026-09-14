import type { Href } from 'expo-router'

/**
 * The Community screen, reached from `View all` at the end of an expanded
 * Community.
 *
 * Its own route rather than a section under the Conversation list, because it
 * outlives the tab it is opened from: a relaunch onto it, and later a
 * notification about a Group, both land here with nothing else on the stack.
 */
export function communityHref(id: string): Href {
  return { pathname: '/community/[id]', params: { id } }
}

/**
 * Resolve `/community/:id` from search params or the pathname.
 *
 * The same reader every other dynamic route in this app has, and for the same
 * reason: params are often empty after a Metro reload, and the pathname is what
 * is left. See `lib/chat-route-id`.
 */
export function communityIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams

  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'community' && parts[1] && parts[1] !== '[id]') {
    return decodeURIComponent(parts[1])
  }
  return undefined
}
