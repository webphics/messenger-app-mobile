import { donutPath, piePath, pieSlices } from '@/lib/pie-slices'

describe('pieSlices', () => {
  test('empty total stays zero sweep', () => {
    expect(pieSlices([{ label: 'a', value: 0 }])).toEqual([
      { label: 'a', value: 0, startAngle: 0, sweep: 0 },
    ])
  })

  test('splits full circle', () => {
    const slices = pieSlices([
      { label: 'a', value: 1 },
      { label: 'b', value: 1 },
    ])
    expect(slices[0].sweep).toBeCloseTo(Math.PI)
    expect(slices[1].sweep).toBeCloseTo(Math.PI)
    expect(slices[0].startAngle + slices[0].sweep).toBeCloseTo(slices[1].startAngle)
  })
})

describe('piePath / donutPath', () => {
  test('zero sweep is empty', () => {
    expect(piePath(10, 10, 8, 0, 0)).toBe('')
    expect(donutPath(10, 10, 8, 4, 0, 0)).toBe('')
  })

  test('quarter pie has arc', () => {
    expect(piePath(0, 0, 10, 0, Math.PI / 2)).toContain('A 10 10')
  })
})
