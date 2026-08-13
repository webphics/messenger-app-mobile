import {
  overlayFrame,
  overlayFrameFromPoint,
  replyStyle,
  trayStyle,
} from '@/lib/overlay-frame'

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
