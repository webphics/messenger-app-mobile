import { DEFAULT_WALL_SORT, WALL_SORT_OPTIONS, parseWallSort } from '@/lib/wall-sort'

describe('parseWallSort', () => {
  it('reads popular back as popular', () => {
    expect(parseWallSort('popular')).toBe('popular')
  })

  it('reads recent back as recent', () => {
    expect(parseWallSort('recent')).toBe('recent')
  })

  it('falls back to the default for a value this build never wrote', () => {
    expect(parseWallSort('trending')).toBe(DEFAULT_WALL_SORT)
  })

  it('falls back to the default when nothing was ever written', () => {
    expect(parseWallSort(null)).toBe(DEFAULT_WALL_SORT)
  })

  it('falls back to the default for stray whitespace or an empty file', () => {
    expect(parseWallSort('')).toBe(DEFAULT_WALL_SORT)
  })
})

describe('DEFAULT_WALL_SORT', () => {
  it('is recent, unchanged from what the Wall has always read', () => {
    expect(DEFAULT_WALL_SORT).toBe('recent')
  })
})

describe('WALL_SORT_OPTIONS', () => {
  it('offers exactly the two the API accepts, recent first', () => {
    expect(WALL_SORT_OPTIONS).toEqual(['recent', 'popular'])
  })
})
