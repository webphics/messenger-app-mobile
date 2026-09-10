/**
 * Whether a drag on a bottom sheet let it go.
 *
 * Two ways to say the same thing, and either is enough: the sheet was pulled
 * far enough down to have clearly left, or it was flicked hard enough that
 * distance never got the chance. Distance alone punishes a fast, short flick —
 * the exact gesture somebody uses when they are sure — so velocity is not a
 * tiebreaker here, it is a second answer.
 *
 * `travel` and `velocity` are both in the drag's own direction: positive is
 * downward, which is the way out. Pure, so the thresholds can be tabled rather
 * than felt for in a simulator.
 */
export const SHEET_DISMISS_TRAVEL_FRACTION = 0.25
export const SHEET_DISMISS_VELOCITY = 600

export type SheetDrag = {
  /** Pixels the sheet has been pulled down from its resting place. */
  travel: number
  /** Pixels per second at the moment the finger left. */
  velocity: number
  /** The sheet's own height — what a quarter of the way down means. */
  height: number
}

export function shouldDismissSheet({ travel, velocity, height }: SheetDrag): boolean {
  'worklet'
  if (velocity >= SHEET_DISMISS_VELOCITY) return true
  // A flick upwards is a person putting the sheet back, whatever the distance.
  if (velocity <= -SHEET_DISMISS_VELOCITY) return false
  if (height <= 0) return false
  return travel >= height * SHEET_DISMISS_TRAVEL_FRACTION
}
