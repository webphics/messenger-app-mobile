import { readWallSort, writeWallSort } from '@/lib/wall-sort-storage'

/**
 * The one boundary this module has, hand-written exactly as
 * `push-registry.test.ts` writes the same cache for its own record.
 */
const mockCache = new Map<string, string>()
let mockCacheReadFails = false
let mockCacheWriteFails = false

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    name: string
    constructor(directory: unknown, name: string) {
      this.name = `${String(directory)}${name}`
    }
    get exists() {
      if (mockCacheReadFails) throw new Error('cache unreadable')
      return mockCache.has(this.name)
    }
    write(text: string) {
      if (mockCacheWriteFails) throw new Error('cache unwritable')
      mockCache.set(this.name, text)
    }
    textSync() {
      if (mockCacheReadFails) throw new Error('cache unreadable')
      return mockCache.get(this.name) ?? ''
    }
  },
}))

beforeEach(() => {
  mockCache.clear()
  mockCacheReadFails = false
  mockCacheWriteFails = false
})

describe('readWallSort', () => {
  it('is the default before anything was ever written', () => {
    expect(readWallSort()).toBe('recent')
  })

  it('reads back a choice this device wrote', () => {
    writeWallSort('popular')

    expect(readWallSort()).toBe('popular')
  })

  it('falls back to the default rather than throwing when the cache cannot be read', () => {
    writeWallSort('popular')
    mockCacheReadFails = true

    expect(readWallSort()).toBe('recent')
  })
})

describe('writeWallSort', () => {
  it('stays silent when the cache cannot be written, leaving the prior choice on disk', () => {
    writeWallSort('popular')
    mockCacheWriteFails = true

    expect(() => writeWallSort('recent')).not.toThrow()
    mockCacheWriteFails = false
    expect(readWallSort()).toBe('popular')
  })
})
