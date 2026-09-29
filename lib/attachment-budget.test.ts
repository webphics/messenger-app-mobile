import { keysToEvict, type CachedAttachment } from '@/lib/attachment-budget'

const MB = 1024 * 1024

function entry(overrides: Partial<CachedAttachment> = {}): CachedAttachment {
  return { key: 'a', bytes: MB, usedAt: 1, pinned: false, ...overrides }
}

describe('keysToEvict', () => {
  it.each([
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
   */})
