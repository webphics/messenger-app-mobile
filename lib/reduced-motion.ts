/** Skip layout entering animations when system reduced-motion is on. */
export function enteringAnimation<T>(
  reduceMotion: boolean,
  animation: T,
): T | undefined {
  return reduceMotion ? undefined : animation
}
