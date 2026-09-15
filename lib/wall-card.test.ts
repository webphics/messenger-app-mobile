import {
  groupWallAttachments,
  linkHost,
  wallBodyEmphasis,
  wallCollage,
  wallReactionChips,
  WALL_BODY_LEAD_MAX,
  WALL_COLLAGE_MAX_CELLS,
} from '@/lib/wall-card'
import type { WallPostAttachment, WallPostReaction } from '@/lib/types'

function image(url = 'a'): WallPostAttachment {
  return { kind: 'image', url, fileName: null, size: null }
}

const images = (n: number) => Array.from({ length: n }, (_u, i) => image(`image-${i}`))

describe('groupWallAttachments', () => {
  it('splits the three kinds in the order they were attached', () => {
    const grouped = groupWallAttachments([
      image('one'),
      { kind: 'document', url: 'doc', fileName: null, size: null },
      { kind: 'video', url: 'vid', fileName: null, size: null },
      image('two'),
    ])
    expect(grouped.images.map(a => a.url)).toEqual(['one', 'two'])
    expect(grouped.videos).toHaveLength(1)
    expect(grouped.documents).toHaveLength(1)
  })
})

describe('the collage', () => {
  it('is nothing at all when a Post carries no image', () => {
    expect(wallCollage([])).toBeNull()
  })

  it.each([
    [1, 'single'],
    [2, 'pair'],
    [3, 'feature'],
    [4, 'quad'],
    [9, 'quad'],
  ])('lays %i images out as a %s', (count, kind) => {
    expect(wallCollage(images(count))?.kind).toBe(kind)
  })

  it('draws at most four cells and counts the rest behind the last', () => {
    const collage = wallCollage(images(7))
    expect(collage?.visible).toHaveLength(WALL_COLLAGE_MAX_CELLS)
    expect(collage?.overflowCount).toBe(3)
  })

  it('counts nothing behind a collage that draws every image', () => {
    expect(wallCollage(images(3))?.overflowCount).toBe(0)
  })

  it('knows its height before an image has loaded, so the card cannot move', () => {
    for (const count of [1, 2, 3, 4, 8]) {
      expect(wallCollage(images(count))?.aspectRatio).toBeGreaterThan(0)
    }
  })
})

describe('linkHost', () => {
  it.each([
    ['https://example.com/notice', 'example.com'],
    ['https://www.example.com/notice', 'example.com'],
    ['http://example.com:8080/notice', 'example.com'],
    ['https://docs.example.co.uk/a/b?c=d#e', 'docs.example.co.uk'],
  ])('reads %s as %s', (url, host) => {
    expect(linkHost(url)).toBe(host)
  })

  it('falls back to the raw string rather than hiding where a button goes', () => {
    expect(linkHost('not a url')).toBe('not a url')
  })
})

describe('how a body is set', () => {
  it('leads when it is short and has no images above it to carry the card', () => {
    expect(wallBodyEmphasis('We are closed on Monday.', false)).toBe('lead')
  })

  it('does not lead under a collage, which is already carrying the card', () => {
    expect(wallBodyEmphasis('We are closed on Monday.', true)).toBe('body')
  })

  it('does not lead once it is a paragraph rather than a statement', () => {
    expect(wallBodyEmphasis('x'.repeat(WALL_BODY_LEAD_MAX + 1), false)).toBe('body')
  })
})

function reaction(emoji: string, userId: string): WallPostReaction {
  return { emoji, userId }
}

describe('wallReactionChips', () => {
  it('draws nothing for a Post nobody has reacted to', () => {
    expect(wallReactionChips([], 'user-1')).toEqual([])
  })

  it('counts everybody who reacted with the same emoji as one chip', () => {
    const chips = wallReactionChips(
      [reaction('👍', 'user-1'), reaction('👍', 'user-2'), reaction('👍', 'user-3')],
      'user-4',
    )
    expect(chips).toEqual([{ emoji: '👍', count: 3, mine: false }])
  })

  it('says which chip is the viewer’s own', () => {
    const chips = wallReactionChips([reaction('👍', 'user-1'), reaction('🔥', 'user-2')], 'user-2')
    expect(chips).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🔥', count: 1, mine: true },
    ])
  })

  it('orders chips by the emoji’s first appearance, so the row does not reshuffle', () => {
    const chips = wallReactionChips(
      [reaction('🔥', 'user-1'), reaction('👍', 'user-2'), reaction('🔥', 'user-3')],
      'user-1',
    )
    expect(chips.map((chip) => chip.emoji)).toEqual(['🔥', '👍'])
  })
})
