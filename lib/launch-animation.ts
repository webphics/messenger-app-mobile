/**
 * Intrinsic pixel size of `assets/images/launch-animation.webp`.
 *
 * Not exactly 16:9 — the encoder rounds height to an even number, so the real
 * asset is 720x406 rather than 720x405. Deriving the on-screen box from these
 * numbers avoids a sliver of letterboxing under `contentFit="contain"`.
 */
export const LAUNCH_ANIMATION_WIDTH_PX = 720
export const LAUNCH_ANIMATION_HEIGHT_PX = 406
export const LAUNCH_ANIMATION_ASPECT =
  LAUNCH_ANIMATION_WIDTH_PX / LAUNCH_ANIMATION_HEIGHT_PX

export type LaunchAnimationSize = { width: number; height: number }

/**
 * On-screen box for the launch animation: 85% of the screen, capped so it
 * never dominates a tablet. Clamped at zero because `Dimensions.get` can
 * report 0 before the window is measured.
 */
export function launchAnimationSize(
  screenWidth: number,
  maxWidth = 360,
): LaunchAnimationSize {
  const width = Math.max(0, Math.min(screenWidth * 0.85, maxWidth))
  return { width, height: width / LAUNCH_ANIMATION_ASPECT }
}
