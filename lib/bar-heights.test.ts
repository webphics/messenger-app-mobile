import { barHeights } from '@/lib/bar-heights'

describe('barHeights', () => {
  test('empty series', () => {
    expect(barHeights([])).toEqual([])
  })

  test('flat series uses mid height', () => {
    expect(barHeights([4, 4, 4], 8, 100)).toEqual([54, 54, 54])
  })

  test('scales min to max', () => {
    expect(barHeights([0, 10], 0, 100)).toEqual([0, 100])
  })
})
