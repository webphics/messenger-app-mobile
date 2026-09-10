import {
  FadeIn,
  FadeInDown,
  FadeOutUp,
  ZoomIn,
} from "react-native-reanimated";

import { motion } from "@/lib/motion";
import { layoutAnimation } from "@/lib/reduced-motion";

/**
 * Focal: Enki Blue bubble settles onto the Clear Desk in its list slot.
 * Thread FlatList is inverted — never use positive translateY (that drives
 * the bubble into the composer). Scale + opacity only (ZoomIn, not FadeInDown).
 *
 * Only ever the viewer's own just-sent Message: history scrolling past is not
 * arriving, and a bubble that lands every time it is recycled says something
 * happened when nothing did.
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

/**
 * Quiet opacity settle — an overlay, an empty state, an auth field.
 *
 * Deliberately not available to a row inside a `FlatList`: a virtualized list
 * mounts a row every time it scrolls into the window, so an entrance there is
 * not an entrance at all — it is the same fade replayed under the thumb, on the
 * one surface a person touches most.
 */
export function settleEnter(reduceMotion: boolean, delayMs = 0) {
  return layoutAnimation(
    reduceMotion,
    FadeIn.springify()
      .damping(motion.springs.settle.damping)
      .stiffness(motion.springs.settle.stiffness)
      .delay(delayMs),
  );
}

/** A strip arriving above what is already on screen — a reply bar, a banner. */
export function settleDownEnter(reduceMotion: boolean, delayMs = 0) {
  return layoutAnimation(
    reduceMotion,
    FadeInDown.springify()
      .damping(motion.springs.rise.damping)
      .stiffness(motion.springs.rise.stiffness)
      .delay(delayMs),
  );
}

/**
 * An expand revealing its own body.
 *
 * Opacity and nothing else, and short: the row has already resized underneath
 * the finger that asked for it, so this is feedback on a tap rather than a
 * thing arriving, and it is spent tens of times a day.
 */
export function disclosureEnter(reduceMotion: boolean) {
  return layoutAnimation(
    reduceMotion,
    FadeIn.duration(motion.durations.disclosure),
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
