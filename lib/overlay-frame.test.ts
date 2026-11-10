import { anchorFromPayload, isPlausibleRect, reactionBarStyle } from '@/lib/overlay-frame'

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
        mine: true,
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
    mine: true,
    x: 160,
    y: 400 * 33 - 80 - 20,
    width: 80,
    height: 40,
    hostWidth: 400,
  })
})

describe('reactionBarStyle', () => {
  const host = { width: 400, height: 800 }
  const bubble = { x: 200, y: 300, width: 180, height: 48 }

  test('sits above the bubble, hugging the end side for outgoing', () => {
    expect(reactionBarStyle(bubble, true, host, 60, 100)).toEqual({ top: 232, right: 20 })
  })

  test('hugs the start side for incoming', () => {
    expect(reactionBarStyle({ ...bubble, x: 16 }, false, host, 60, 100)).toEqual({ top: 232, left: 16 })
  })

  test('drops below a bubble too near the top', () => {
    expect(reactionBarStyle({ ...bubble, y: 20 }, true, host, 60, 100).top).toBe(76)
  })

  test('slides inwards rather than off the far edge', () => {
    expect(reactionBarStyle({ ...bubble, x: 56 }, false, { width: 360, height: 800 }, 60, 100, 322)).toEqual({ top: 232, left: 30 })
  })

  test('never lands under the action bar', () => {
    expect(reactionBarStyle({ ...bubble, y: 20, height: 760 }, true, host, 60, 100).top).toBe(632)
  })
})
