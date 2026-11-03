import type { ReactNode } from 'react'

/**
 * A label set in capitals by the `uppercase` class, done to the string instead.
 *
 * Android measures a `Text` before `textTransform` reaches it, so under Manrope
 * with `tracking-*` on some devices the box is a glyph short and the last
 * letter is cut off: "SUPPOR", "ACCOUN". Capitalising the characters
 * themselves means what is measured is what is drawn, on every platform, and
 * iOS renders the same glyphs it always did.
 *
 * What a screen reader is given is the words as written, because an all-caps
 * string is one some readers spell out letter by letter.
 *
 * Null when there is nothing to do — no `uppercase` class, or children that
 * are not plain text, such as a nested `Text`, which keep the class and the
 * native transform since their strings cannot be reached from here.
 */
export function capsText(
  className: string,
  children: ReactNode
): { className: string; children: string; label: string } | null {
  const tokens = className.split(/\s+/)
  if (!tokens.includes('uppercase')) return null

  const label = plainText(children)
  if (label === null) return null

  return {
    className: tokens.filter((token) => token !== 'uppercase').join(' '),
    children: label.toUpperCase(),
    label,
  }
}

function plainText(children: ReactNode): string | null {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (children === null || children === undefined || typeof children === 'boolean') return ''
  if (Array.isArray(children)) {
    let text = ''
    for (const child of children) {
      const part = plainText(child)
      if (part === null) return null
      text += part
    }
    return text
  }
  return null
}
