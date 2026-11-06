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
 * The shape of a Community id: the API mints one with `randomUUID()` and every
 * `/communities/:id` route reads it through `ParseUUIDPipe`.
 */
const COMMUNITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve `/community/:id` from search params or the pathname.
 *
 * The same reader every other dynamic route in this app has, and for the same
 * reason: params are often empty after a Metro reload, and the pathname is what
 * is left. See `lib/chat-route-id`.
 *
 * The id arrives from a deep link as well as from `View all`, and it ends up in
 * a request path. Anything that is not a UUID answers undefined, so a link
 * carrying `../` or a query can only ever reach the screen as "no Community",
 * which redirects to the role's Hub.
 */
export function communityIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return asCommunityId(fromParams)

  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'community' && parts[1] && parts[1] !== '[id]') {
    return asCommunityId(safeDecode(parts[1]))
  }
  return undefined
}

function asCommunityId(value: string | undefined): string | undefined {
  return value !== undefined && COMMUNITY_ID.test(value) ? value : undefined
}

/** `decodeURIComponent` throws on a stray `%`, and a deep link can carry one. */
function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}
