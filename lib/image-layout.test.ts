import { fitImageSize, mediaCaptionColumnWidth } from '@/lib/image-layout'

describe('fitImageSize', () => {
  test('landscape fits width first', () => {
    expect(fitImageSize(1600, 900, 280, 360)).toEqual({
      width: 280,
      height: 158,
    })
  })

  test('portrait clamps to max height', () => {
    expect(fitImageSize(900, 1600, 280, 360)).toEqual({
      width: 203,
      height: 360,
    })
  })

  test('invalid natural falls back to taller placeholder', () => {
    expect(fitImageSize(0, 0, 280, 400)).toEqual({
      width: 280,
      height: 336,
    })
  })

  test('square stays square within box', () => {
    expect(fitImageSize(1000, 1000, 280, 360)).toEqual({
      width: 280,
      height: 280,
    })
  })
})

describe('mediaCaptionColumnWidth', () => {
  test('without caption matches media width', () => {
    expect(mediaCaptionColumnWidth(160, 300, false)).toBe(160)
  })

  test('with caption uses full bubble max', () => {
    expect(mediaCaptionColumnWidth(160, 300, true)).toBe(300)
  })
})
