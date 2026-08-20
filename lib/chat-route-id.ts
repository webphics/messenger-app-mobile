import type { Href } from 'expo-router'

/** Native Expo Router needs the dynamic segment in `params`, not only a string path. */
export function chatHref(id: string): Href {
  return { pathname: '/chat/[id]', params: { id } }
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
