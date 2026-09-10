import {
  SHEET_DISMISS_TRAVEL_FRACTION,
  SHEET_DISMISS_VELOCITY,
  shouldDismissSheet,
} from '@/lib/sheet-dismiss'

const HEIGHT = 400
const past = HEIGHT * SHEET_DISMISS_TRAVEL_FRACTION

describe('shouldDismissSheet', () => {
  test('a slow drag holds until it is a quarter of the way down', () => {
    expect(shouldDismissSheet({ travel: past - 1, velocity: 0, height: HEIGHT })).toBe(false)
    expect(shouldDismissSheet({ travel: past, velocity: 0, height: HEIGHT })).toBe(true)
  })

  test('a flick is enough on its own, however short', () => {
    expect(
      shouldDismissSheet({ travel: 12, velocity: SHEET_DISMISS_VELOCITY, height: HEIGHT }),
    ).toBe(true)
  })

  test('a flick back up keeps the sheet even past the distance', () => {
    expect(
      shouldDismissSheet({
        travel: HEIGHT * 0.9,
        velocity: -SHEET_DISMISS_VELOCITY,
        height: HEIGHT,
      }),
    ).toBe(false)
  })

  test('an unmeasured sheet is never dismissed by distance alone', () => {
    expect(shouldDismissSheet({ travel: 999, velocity: 0, height: 0 })).toBe(false)
    // …but a flick still works, because it needs no height to be read.
    expect(shouldDismissSheet({ travel: 0, velocity: 900, height: 0 })).toBe(true)
  })
})
