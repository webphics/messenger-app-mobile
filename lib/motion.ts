/**
 * Clear Desk motion language — shared springs / durations / stagger caps.
 * Thesis: things settle onto the desk; outbound bubbles are the focal land.
 * Transform + opacity only. Exit faster than enter. Honor reduced motion at call sites.
 */
export const motion = {
  springs: {
    /** Press / tactile scale */
    press: { damping: 18, stiffness: 380, mass: 0.45 },
    /** Quiet list / hub / settings enter */
    settle: { damping: 20, stiffness: 220 },
    /** Hub section rise onto the desk */
    rise: { damping: 18, stiffness: 180 },
    /** Outbound message lands on the desk */
    desk: { damping: 18, stiffness: 280, mass: 0.65 },
    /** Reaction tray pop */
    tray: { damping: 14, stiffness: 340, mass: 0.4 },
    /** Sheets, tab indicator, swipe snap-back */
    overlay: { damping: 22, stiffness: 320, mass: 0.55 },
  },
  durations: {
    flash: 80,
    feedback: 120,
    overlay: 220,
    /** Soft presence breathe (half-cycle) */
    breathe: 900,
  },
  /** Sibling list stagger — total delay capped so queues never wait. */
  stagger: {
    stepMs: 40,
    maxItems: 5,
  },
} as const;

export function staggerDelay(index: number): number {
  const capped = Math.min(Math.max(index, 0), motion.stagger.maxItems - 1);
  return capped * motion.stagger.stepMs;
}
