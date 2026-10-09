/**
 * Placeholders in a saved response, filled in as it lands in the composer.
 *
 * Filled on this device, from what the thread already holds, rather than by the
 * API: the text never makes a round trip, so inserting one costs no request. The
 * web client fills them by the same rules (`placeholders.utils`).
 *
 * `{key}` takes the value; `{key|fallback}` takes the fallback when the value is
 * unknown, so "Hi {first_name|there}" reads "Hi there" for somebody with no name
 * on record. With no fallback an unknown value is left out. A key this client
 * does not know -- `{order}`, a typo -- is left exactly as written, so the Agent
 * sees it in the composer before it is sent.
 */

/** What the composer knows about the conversation it is in. */
export type PlaceholderValues = {
  /** The customer's name. */
  name?: string | null
  /** The signed-in staff member's name. */
  myName?: string | null
  /** The conversation's organization. */
  organization?: string | null
}

/** One line naming every placeholder, and the fallback syntax. */
export const PLACEHOLDER_HINT =
  'Placeholders: {name}, {first_name}, {my_name}, {organization}. Add a fallback with {first_name|there}.'

/** `undefined` only for a key this client does not know; a known one with no value is `null`. */
function resolve(key: string, values: PlaceholderValues): string | null | undefined {
  switch (key) {
    case 'name':
      return values.name ?? null
    case 'first_name':
      return values.name?.trim().split(/\s+/)[0] ?? null
    case 'my_name':
      return values.myName ?? null
    case 'organization':
      return values.organization ?? null
    default:
      return undefined
  }
}

const PLACEHOLDER = /\{\s*([a-z_]+)\s*(?:\|([^{}]*))?\}/gi

export function fillPlaceholders(body: string, values: PlaceholderValues): string {
  return body.replace(PLACEHOLDER, (match, key: string, fallback: string | undefined) => {
    const resolved = resolve(key.toLowerCase(), values)
    if (resolved === undefined) return match
    const value = resolved?.trim()
    return value ? value : (fallback ?? '').trim()
  })
}
