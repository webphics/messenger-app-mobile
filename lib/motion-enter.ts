import {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOutUp,
  ZoomIn,
} from "react-native-reanimated";

import { motion, staggerDelay } from "@/lib/motion";
import { layoutAnimation } from "@/lib/reduced-motion";

/**
 * Focal: Enki Blue bubble settles onto the Clear Desk in its list slot.
 * Thread FlatList is inverted — never use positive translateY (that drives
 * the bubble into the composer). Scale + opacity only (ZoomIn, not FadeInDown).
 */
export function deskMessageEnter(reduceMotion: boolean) {
  return (
    layoutAnimation(
      reduceMotion,
      ZoomIn.springify()
        .damping(motion.springs.desk.damping)
        .stiffness(motion.springs.desk.stiffness)
        .mass(motion.springs.desk.mass)
        .withInitialValues({
          transform: [{ scale: 0.94 }],
        }),
    ) ?? FadeIn.duration(motion.durations.feedback)
  );
}

/** Quiet opacity settle — rows, cards, auth fields. */
export function settleEnter(reduceMotion: boolean, delayMs = 0) {
  return layoutAnimation(
    reduceMotion,
    FadeIn.springify()
      .damping(motion.springs.settle.damping)
      .stiffness(motion.springs.settle.stiffness)
      .delay(delayMs),
  );
}

/** Hub / settings section rises onto the desk. */
export function settleDownEnter(reduceMotion: boolean, delayMs = 0) {
  return layoutAnimation(
    reduceMotion,
    FadeInDown.springify()
      .damping(motion.springs.rise.damping)
      .stiffness(motion.springs.rise.stiffness)
      .delay(delayMs),
  );
}

/** Horizontal carousel / chart card arrive. */
export function settleRightEnter(reduceMotion: boolean, delayMs = 0) {
  return layoutAnimation(
    reduceMotion,
    FadeInRight.springify()
      .damping(motion.springs.rise.damping)
      .stiffness(motion.springs.rise.stiffness)
      .delay(delayMs),
  );
}

/** Inbox / directory rows — capped stagger so long lists stay snappy. */
export function listItemEnter(reduceMotion: boolean, index: number) {
  return settleEnter(reduceMotion, staggerDelay(index));
}

/** Unread badge / role check — feedback pop, not entrance choreography. */
export function popEnter(reduceMotion: boolean) {
  return layoutAnimation(
    reduceMotion,
    ZoomIn.springify()
      .damping(motion.springs.tray.damping)
      .stiffness(motion.springs.tray.stiffness)
      .mass(motion.springs.tray.mass),
  );
}

/**
 * A strip at the top of the screen leaving the way it came.
 *
 * The counterpart to `settleDownEnter`, and faster than it — an exit is a thing
 * that is over rather than a thing arriving, and the Clear Desk language exits
 * quicker than it enters.
 */
export function settleUpExit(reduceMotion: boolean) {
  return layoutAnimation(
    reduceMotion,
    FadeOutUp.duration(motion.durations.overlay),
  );
}
