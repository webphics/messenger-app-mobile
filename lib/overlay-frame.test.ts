import {
  anchorFromPayload,
  isPlausibleRect,
  overlayFrame,
  overlayFrameFromPoint,
  replyStyle,
  trayStyle,
} from '@/lib/overlay-frame'

const screen = { width: 400, height: 800 }

describe('isPlausibleRect', () => {
  test('accepts an on-screen bubble', () => {
    expect(isPlausibleRect({ x: 16, y: 200, width: 180, height: 48 }, screen)).toBe(true)
  })

  test('rejects zero size, NaN, and 33x off-screen Android coords', () => {
    expect(isPlausibleRect({ x: 16, y: 200, width: 0, height: 48 }, screen)).toBe(false)
    expect(isPlausibleRect({ x: Number.NaN, y: 200, width: 180, height: 48 }, screen)).toBe(false)
    expect(isPlausibleRect({ x: 16, y: 200 * 33, width: 180, height: 48 }, screen)).toBe(false)
  })
})

describe('overlayFrame', () => {
  test('subtracts host origin so status-bar offset cancels', () => {
    expect(
      overlayFrame(
        { x: 100, y: 300, width: 180, height: 48 },
        { x: 0, y: 80, width: 400, height: 700 },
      ),
    ).toEqual({ x: 100, y: 220, width: 180, height: 48 })
  })
})

describe('overlayFrameFromPoint', () => {
  test('centers the layout size on the finger, host-local', () => {
    expect(
      overlayFrameFromPoint(200, 400, { width: 80, height: 40 }, {
        x: 0,
        y: 80,
        width: 400,
        height: 700,
      }),
    ).toEqual({ x: 160, y: 300, width: 80, height: 40 })
  })
})

describe('anchorFromPayload', () => {
  const host = { x: 0, y: 80, width: 400, height: 700 }

  test('returns null when host has zero size', () => {
    expect(
      anchorFromPayload(
        {
          messageId: 'm1',
          outgoing: false,
          pageX: 16,
          pageY: 200,
          width: 180,
          height: 48,
        },
        { x: 0, y: 0, width: 0, height: 0 },
        screen,
      ),
    ).toBeNull()
  })

  test('uses overlayFrame when the window rect is plausible', () => {
    expect(
      anchorFromPayload(
        {
          messageId: 'm1',
          outgoing: false,
          pageX: 16,
          pageY: 280,
          width: 180,
          height: 48,
        },
        host,
        screen,
      ),
    ).toEqual({
      messageId: 'm1',
      outgoing: false,
      x: 16,
      y: 200,
      width: 180,
      height: 48,
      hostWidth: 400,
    })
  })

  test('falls back to finger + size when the window rect is implausible', () => {
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
        host,
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
})

describe('trayStyle / replyStyle', () => {
  const incoming = { x: 16, y: 200, width: 180, height: 48 }
  const outgoing = { x: 200, y: 200, width: 180, height: 48 }

  test('incoming tray sits on the bubble, inset toward center', () => {
    expect(trayStyle(incoming, false, 400)).toEqual({ top: 200, left: 38 })
  })

  test('outgoing tray sits on the bubble, inset toward center', () => {
    expect(trayStyle(outgoing, true, 400)).toEqual({ top: 200, right: 42 })
  })

  test('reply sits just below the bubble with the same x inset', () => {
    expect(replyStyle(incoming, false, 400)).toEqual({ top: 248, left: 38 })
    expect(replyStyle(outgoing, true, 400)).toEqual({ top: 248, right: 42 })
  })
})
