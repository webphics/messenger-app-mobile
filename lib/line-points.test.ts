import { linePoints } from '@/lib/line-points'

describe('linePoints', () => {
  test('empty or zero size', () => {
    expect(linePoints([], 100, 40)).toEqual([])
    expect(linePoints([1, 2], 0, 40)).toEqual([])
  })

  test('maps min to bottom and max to top', () => {
    const pts = linePoints([0, 10], 100, 40, 0)
    expect(pts[0]).toEqual({ x: 0, y: 40 })
    expect(pts[1]).toEqual({ x: 100, y: 0 })
  })
})
