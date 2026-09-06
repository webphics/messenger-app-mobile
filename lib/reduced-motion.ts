/**
 * Skip a layout animation when system reduced-motion is on.
 *
 * Entering and exiting both, which is why it is not named for either: the
 * question is the same one in both directions, and the answer is nothing rather
 * than a shorter version of the animation. Reanimated reads `undefined` as no
 * animation at all, so the element simply appears or goes.
 */
export function layoutAnimation<T>(
  reduceMotion: boolean,
  animation: T,
): T | undefined {
  return reduceMotion ? undefined : animation
}
