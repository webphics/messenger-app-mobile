/**
 * Where the links are in a piece of text somebody wrote.
 *
 * Pure, so the rules for where a link ends — the part people get wrong — are a
 * table in a test rather than something found on a phone.
 */

export type TextSegment =
  | { kind: 'text'; text: string }
  /** `text` is what was written; `href` is what opens, with a scheme. */
  | { kind: 'link'; text: string; href: string }

/**
 * A URL with a scheme, or one starting `www.`. Bare domains (`example.com`) are
 * deliberately not matched: "e.g." and "node.js" read as domains too, and a
 * sentence turning blue at random is worse than a link that needs `www.`.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi

/** Characters that end a sentence more often than a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'"*_~]+$/

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function count(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n++
  return n
}

/**
 * Trims what a match swallowed from the sentence around it: the full stop after
 * it, and a closing bracket the URL did not open — "(see https://x.io/a)" — while
 * keeping one it did, as in a Wikipedia path.
 */
function trimUrl(raw: string): string {
  let url = raw
  for (;;) {
    const before = url
    url = url.replace(TRAILING_PUNCTUATION, '')
    const last = url.at(-1)
    const opener = last ? CLOSERS[last] : undefined
    if (opener && count(url, last!) > count(url, opener)) url = url.slice(0, -1)
    if (url === before) return url
  }
}

export function linkHref(text: string): string {
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}

export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    const url = trimUrl(match[0])
    // `www.` alone, or a scheme with nothing after it, is not somewhere to go.
    if (!/^(?:https?:\/\/|www\.)[^./]/i.test(url) || !url.includes('.')) continue

    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) })
    segments.push({ kind: 'link', text: url, href: linkHref(url) })
    cursor = start + url.length
  }

  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}

export function hasLink(text: string): boolean {
  return linkify(text).some((segment) => segment.kind === 'link')
}
