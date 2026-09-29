import { anchorFromPayload, isPlausibleRect } from '@/lib/overlay-frame'

const screen = { width: 400, height: 800 }

test('rejects zero size, NaN, and 33x off-screen Android coords', () => {
  expect(isPlausibleRect({ x: 16, y: 200, width: 0, height: 48 }, screen)).toBe(false)
  expect(isPlausibleRect({ x: Number.NaN, y: 200, width: 180, height: 48 }, screen)).toBe(false)
  expect(isPlausibleRect({ x: 16, y: 200 * 33, width: 180, height: 48 }, screen)).toBe(false)
})

test('anchorFromPayload falls back to finger + size when the window rect is implausible', () => {
  expect(
    anchorFromPayload(
      {
        messageId: 'm2',
        outgoing: true,
        pageX: 200,
        pageY: 400 * 33,
        width: 80,
        height: 40,
      },
      { x: 0, y: 80, width: 400, height: 700 },
      screen,
    ),
  ).toEqual({
    messageId: 'm2',
    outgoing: true,
    x: 160,
    y: 400 * 33 - 80 - 20,
    width: 80,
    height: 40,
    hostWidth: 400,
  })
})
