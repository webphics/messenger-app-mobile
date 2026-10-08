import type { Href } from 'expo-router'

/**
 * Native Expo Router needs the dynamic segment in `params`, not only a string
 * path.
 *
 * `postId` is the Post a Reply to a Post (#77) opens the thread with: it waits
 * in the composer and goes out as a card with the next message. It travels as
 * a param rather than through the shared conversation list because it belongs
 * to this one visit, not to the thread.
 */
export function chatHref(id: string, postId?: string): Href {
  return { pathname: '/chat/[id]', params: postId ? { id, post: postId } : { id } }
}

/**
 * The two screens that hang off a thread: its details, and everything shared in
 * it.
 *
 * Siblings of `/chat/[id]` rather than segments under it, because that path is
 * already a leaf: the thread owns `/chat/:id`, and nesting under it would make
 * the thread an `index` and rewrite every href in the app to gain nothing.
 *
 * The id each carries is the conversation's own, never the `offers` alias — the
 * thread resolves that alias against the conversations this person is in, and
 * both routes are only ever reached from a thread that has already done so.
 */
export function chatMediaHref(id: string): Href {
  return { pathname: '/chat/media/[id]', params: { id } }
}

export function chatDetailsHref(id: string): Href {
  return { pathname: '/chat/details/[id]', params: { id } }
}

/**
 * Message info, for one message in one thread.
 *
 * A third section beside details and media, and it carries the conversation id
 * in the path like the other two: the message is the subject of the screen, but
 * the conversation is what the permission is asked about, and every one of these
 * routes resolves that the same way. The message travels as a param rather than
 * a second segment, which would make this the only two-id route in the app.
 */
export function chatMessageInfoHref(id: string, messageId: string): Href {
  return { pathname: '/chat/message-info/[id]', params: { id, messageId } }
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
 * Resolve `/chat/<section>/:id`.
 *
 * Its own reader rather than `chatIdFromRoute`, which would read the literal
 * `media` or `details` as the conversation id: the segment after `chat` is what
 * that one takes, and on these routes that segment is the section's name.
 */
function chatSectionIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
  section: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'chat' && parts[1] === section && parts[2] && parts[2] !== '[id]') {
    return decodeURIComponent(parts[2])
  }
  return undefined
}

export function chatMediaIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  return chatSectionIdFromRoute(raw, pathname, 'media')
}

export function chatDetailsIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  return chatSectionIdFromRoute(raw, pathname, 'details')
}

export function chatMessageInfoIdFromRoute(
  raw: string | string[] | undefined,
  pathname: string,
): string | undefined {
  return chatSectionIdFromRoute(raw, pathname, 'message-info')
}
