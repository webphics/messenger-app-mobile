import { hasLink, linkify } from '@/lib/linkify'

/** Links only, as `text -> href`. */
function links(text: string): string[] {
  return linkify(text).flatMap((segment) =>
    segment.kind === 'link' ? [`${segment.text} -> ${segment.href}`] : [],
  )
}

describe('linkify', () => {
  test('text with no link is one text segment', () => {
    expect(linkify('hello there')).toEqual([{ kind: 'text', text: 'hello there' }])
  })

  test('keeps the text around a link', () => {
    expect(linkify('see https://example.com now')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', text: ' now' },
    ])
  })

  test.each([
    ['https://example.com/a?b=1#c', 'https://example.com/a?b=1#c -> https://example.com/a?b=1#c'],
    ['http://example.com', 'http://example.com -> http://example.com'],
    ['HTTPS://Example.com', 'HTTPS://Example.com -> HTTPS://Example.com'],
    ['www.example.com/x', 'www.example.com/x -> https://www.example.com/x'],
    ['Go to https://example.com.', 'https://example.com -> https://example.com'],
    ['Really? https://example.com/?!', 'https://example.com/ -> https://example.com/'],
    ['(see https://example.com/a)', 'https://example.com/a -> https://example.com/a'],
    [
      'https://en.wikipedia.org/wiki/Foo_(bar)',
      'https://en.wikipedia.org/wiki/Foo_(bar) -> https://en.wikipedia.org/wiki/Foo_(bar)',
    ],
    ['"https://example.com"', 'https://example.com -> https://example.com'],
  ])('%s', (input, expected) => {
    expect(links(input)).toEqual([expected])
  })

  test('finds several links', () => {
    expect(links('a https://one.io b www.two.io')).toEqual([
      'https://one.io -> https://one.io',
      'www.two.io -> https://www.two.io',
    ])
  })

  test.each(['node.js and e.g. example.com', 'https://', 'www.', 'awww.cute', 'mailto:a@b.c'])(
    'no link in %s',
    (input) => {
      expect(hasLink(input)).toBe(false)
    },
  )

  test('segments join back to the original text', () => {
    const text = 'x https://a.io/b). y www.c.io, z'
    expect(
      linkify(text)
        .map((s) => s.text)
        .join(''),
    ).toBe(text)
  })
})
