import {
  FadeIn,
  FadeInDown,
  FadeInRight,
  ZoomIn,
} from "react-native-reanimated";

import { motion, staggerDelay } from "@/lib/motion";
import { enteringAnimation } from "@/lib/reduced-motion";

/**
 * Focal: Enki Blue bubble settles onto the Clear Desk in its list slot.
 * Thread FlatList is inverted — never use positive translateY (that drives
 * the bubble into the composer). Scale + opacity only (ZoomIn, not FadeInDown).
 */
export function deskMessageEnter(reduceMotion: boolean) {
  return (
    enteringAnimation(
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
  return enteringAnimation(
    reduceMotion,
    FadeIn.springify()
      .damping(motion.springs.settle.damping)
      .stiffness(motion.springs.settle.stiffness)
      .delay(delayMs),
  );
}

/** Hub / settings section rises onto the desk. */
export function settleDownEnter(reduceMotion: boolean, delayMs = 0) {
  return enteringAnimation(
    reduceMotion,
    FadeInDown.springify()
      .damping(motion.springs.rise.damping)
      .stiffness(motion.springs.rise.stiffness)
      .delay(delayMs),
  );
}

/** Horizontal carousel / chart card arrive. */
export function settleRightEnter(reduceMotion: boolean, delayMs = 0) {
  return enteringAnimation(
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
  return enteringAnimation(
    reduceMotion,
    ZoomIn.springify()
      .damping(motion.springs.tray.damping)
      .stiffness(motion.springs.tray.stiffness)
      .mass(motion.springs.tray.mass),
  );
}
