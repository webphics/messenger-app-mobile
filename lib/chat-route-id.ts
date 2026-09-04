import type { Href } from 'expo-router'

/** Native Expo Router needs the dynamic segment in `params`, not only a string path. */
export function chatHref(id: string): Href {
  return { pathname: '/chat/[id]', params: { id } }
}

/**
 * The media gallery for one conversation.
 *
 * A sibling route rather than a segment under `/chat/[id]`, because that path is
 * already a leaf: the thread owns `/chat/:id`, and nesting under it would make
 * the thread an `index` and rewrite every href in the app to gain nothing.
 *
 * The id it carries is the conversation's own, never the `offers` alias — the
 * thread resolves that alias against the conversations this person is in, and
 * this route is only ever reached from a thread that has already done so.
 */
export function chatMediaHref(id: string): Href {
  return { pathname: '/chat/media/[id]', params: { id } }
}

/** Resolve `/chat/:id` from search params, pathname, or segments (params often empty after Metro reload). */
export function chatIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams) return fromParams
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'chat' && parts[1] && parts[1] !== '[id]') return decodeURIComponent(parts[1])
  return undefined
}

export function chatIdFromSegments(segments: readonly string[]): string | undefined {
  const i = segments.indexOf('chat')
  const id = i >= 0 ? segments[i + 1] : undefined
  if (!id || id === '[id]') return undefined
  return decodeURIComponent(id)
}

/**
 * Resolve `/chat/media/:id`.
 *
 * Its own reader rather than `chatIdFromRoute`, which would read the literal
 * `media` as the conversation id: the segment after `chat` is what that one
 * takes, and on this route that segment is the word itself.
 */
export function chatMediaIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'chat' && parts[1] === 'media' && parts[2] && parts[2] !== '[id]') {
    return decodeURIComponent(parts[2])
  }
  return undefined
}
