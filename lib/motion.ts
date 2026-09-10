/**
 * Clear Desk motion language — shared springs / durations.
 * Thesis: things settle onto the desk; outbound bubbles are the focal land.
 * Transform + opacity only. Exit faster than enter. Honor reduced motion at call sites.
 *
 * The budget is spent by frequency, not by surface. Anything reached from a tab
 * — a Hub, the Inbox, Settings — arrives without choreography, because it
 * arrives dozens of times a day and an animation there is a toll rather than an
 * explanation. What is left is the rare and the transient: an overlay saying
 * where it came from, a bubble landing on the desk, a finger on a sheet.
 */
export const motion = {
  springs: {
    /** Press / tactile scale */
    press: { damping: 18, stiffness: 380, mass: 0.45 },
    /** Quiet enter — auth fields, empty states, overlays */
    settle: { damping: 20, stiffness: 220 },
    /** A strip or panel rises into place */
    rise: { damping: 18, stiffness: 180 },
    /** Outbound message lands on the desk */
    desk: { damping: 18, stiffness: 280, mass: 0.65 },
    /** Reaction tray pop */
    tray: { damping: 14, stiffness: 340, mass: 0.4 },
    /** Sheets, tab indicator, swipe snap-back */
    overlay: { damping: 22, stiffness: 320, mass: 0.55 },
  },
  /**
   * Curve control points, as data.
   *
   * Reanimated's own default for `withTiming` is `Easing.inOut(Easing.quad)` —
   * it eases *in*, holding back the first frames, which is the exact moment
   * somebody is watching for a response to something they just did. Nothing in
   * this app leaves `easing` unset for that reason.
   *
   * Points rather than `Easing` objects because this module is pure — it is
   * imported by tests that have no native runtime. `motion-easing` builds them.
   */
  curves: {
    /** Entering, exiting, releasing — full speed first, settles into place. */
    out: [0.23, 1, 0.32, 1],
    /** Something moving from one place to another, both ends visible. */
    inOut: [0.77, 0, 0.175, 1],
  },
  durations: {
    flash: 80,
    feedback: 120,
    /** Disclosure — an expand is feedback, not an entrance. */
    disclosure: 140,
    overlay: 220,
    /** A gesture letting go and going home. */
    release: 160,
    /** Soft presence breathe (half-cycle) */
    breathe: 900,
  },
  /**
   * Resistance past a gesture's stop, as a fraction of the finger's travel.
   *
   * A hard stop reads as a bug — the finger keeps moving and the element does
   * not. Letting it drift a fraction of the way says the edge is real without
   * saying the gesture died.
   */
  rubberBand: 0.15,
} as const;

/**
 * Where a gesture ends up once it is past its limit.
 *
 * Below `limit` the element tracks the finger exactly; past it, it keeps
 * `motion.rubberBand` of every further pixel. Pure so it can be tabled.
 */
export function rubberBand(travel: number, limit: number): number {
  'worklet'
  if (!Number.isFinite(travel) || travel <= 0) return 0
  if (travel <= limit) return travel
  return limit + (travel - limit) * motion.rubberBand
}
