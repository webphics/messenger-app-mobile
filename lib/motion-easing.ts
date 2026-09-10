import {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
} from 'react-native-reanimated'

import { motion } from '@/lib/motion'

/**
 * The Clear Desk curves, built.
 *
 * Split off `motion` because that module is pure and this one is not: `Easing`
 * comes from Reanimated, and a table test of a duration should not need a
 * native runtime to read it. The control points live there; the objects live
 * here, made once at module load rather than per animation.
 *
 * Every `withTiming` in the app passes one of these. Reanimated's default is
 * `Easing.inOut(Easing.quad)`, which eases in — and a UI element that starts
 * slowly reads as lag, because the delay lands on the frames right after the
 * tap or the release that caused it.
 */
export const easing: {
  out: EasingFunctionFactory
  inOut: EasingFunctionFactory
  linear: EasingFunction
} = {
  out: Easing.bezier(...(motion.curves.out as [number, number, number, number])),
  inOut: Easing.bezier(
    ...(motion.curves.inOut as [number, number, number, number]),
  ),
  linear: Easing.linear,
}
