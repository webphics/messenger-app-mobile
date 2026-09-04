import {
  ATTACHMENT_CACHE_BUDGET_BYTES,
  cacheSize,
  keysToEvict,
  type CachedAttachment,
} from '@/lib/attachment-budget'

const MB = 1024 * 1024

function entry(overrides: Partial<CachedAttachment> = {}): CachedAttachment {
  return { key: 'a', bytes: MB, usedAt: 1, pinned: false, ...overrides }
}

describe('ATTACHMENT_CACHE_BUDGET_BYTES', () => {
  it('is 250 MB', () => {
    expect(ATTACHMENT_CACHE_BUDGET_BYTES).toBe(250 * MB)
  })
})

describe('cacheSize', () => {
  it.each([
    ['nothing cached', [], 0],
    ['one entry', [entry({ bytes: 12 })], 12],
    ['every entry', [entry({ key: 'a', bytes: 12 }), entry({ key: 'b', bytes: 30 })], 42],
    [
      'a pinned entry too, because it occupies the disk like any other',
      [entry({ key: 'a', bytes: 12 }), entry({ key: 'b', bytes: 30, pinned: true })],
      42,
    ],
  ])('%s', (_name, entries, expected) => {
    expect(cacheSize(entries)).toBe(expected)
  })
})

describe('keysToEvict', () => {
  it.each([
    ['nothing cached', [], 100],
    ['under the budget', [entry({ bytes: 40 }), entry({ key: 'b', bytes: 30 })], 100],
    [
      'exactly at the budget, which is a ceiling rather than a line to stay under',
      [entry({ bytes: 60 }), entry({ key: 'b', bytes: 40 })],
      100,
    ],
  ])('discards nothing when the cache is %s', (_name, entries, budget) => {
    expect(keysToEvict(entries, budget)).toEqual([])
  })

  /**
   * "Recently used" is what `usedAt` carries — last read, not last downloaded —
   * so a file opened often outlives an older sibling however long ago it landed.
   */
  it('discards the least recently used first', () => {
    const entries = [
      entry({ key: 'newest', bytes: 40, usedAt: 300 }),
      entry({ key: 'oldest', bytes: 40, usedAt: 100 }),
      entry({ key: 'middle', bytes: 40, usedAt: 200 }),
    ]

    expect(keysToEvict(entries, 100)).toEqual(['oldest'])
  })

  it('stops as soon as what is left fits, rather than emptying the cache', () => {
    const entries = [
      entry({ key: 'a', bytes: 40, usedAt: 100 }),
      entry({ key: 'b', bytes: 40, usedAt: 200 }),
      entry({ key: 'c', bytes: 40, usedAt: 300 }),
    ]

    expect(keysToEvict(entries, 90)).toEqual(['a'])
  })

  it('keeps going until it fits, however many that takes', () => {
    const entries = [
      entry({ key: 'a', bytes: 40, usedAt: 100 }),
      entry({ key: 'b', bytes: 40, usedAt: 200 }),
      entry({ key: 'c', bytes: 40, usedAt: 300 }),
    ]

    expect(keysToEvict(entries, 45)).toEqual(['a', 'b'])
  })

  /**
   * A pinned entry is a download still arriving or an upload still being read
   * from. Discarding one would break the thing that is happening now to make
   * room for the thing that happened before it.
   */
  it('never names a pinned entry, even when it is the oldest', () => {
    const entries = [
      entry({ key: 'arriving', bytes: 40, usedAt: 100, pinned: true }),
      entry({ key: 'idle', bytes: 40, usedAt: 200 }),
      entry({ key: 'fresh', bytes: 40, usedAt: 300 }),
    ]

    expect(keysToEvict(entries, 90)).toEqual(['idle'])
  })

  /**
   * Over budget and nothing left that may go. The cache stays too big until the
   * downloads finish, which is the right way round: a budget is not worth
   * breaking an open for.
   */
  it('answers with what it may discard rather than insisting on fitting', () => {
    const entries = [
      entry({ key: 'a', bytes: 40, usedAt: 100, pinned: true }),
      entry({ key: 'b', bytes: 40, usedAt: 200, pinned: true }),
      entry({ key: 'c', bytes: 40, usedAt: 300 }),
    ]

    expect(keysToEvict(entries, 50)).toEqual(['c'])
  })

  it('breaks a tie by key, so the same cache is always trimmed the same way', () => {
    const entries = [
      entry({ key: 'b', bytes: 40, usedAt: 100 }),
      entry({ key: 'a', bytes: 40, usedAt: 100 }),
      entry({ key: 'c', bytes: 40, usedAt: 300 }),
    ]

    expect(keysToEvict(entries, 90)).toEqual(['a'])
  })

  it('leaves the entries it was handed alone', () => {
    const entries = [entry({ key: 'a', bytes: 40, usedAt: 200 }), entry({ key: 'b', bytes: 40, usedAt: 100 })]

    keysToEvict(entries, 10)

    expect(entries.map((one) => one.key)).toEqual(['a', 'b'])
  })
})
