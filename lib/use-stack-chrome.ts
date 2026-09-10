import { useReducedMotion } from "react-native-reanimated";

import { stackChrome } from "@/lib/tokens";

/**
 * Push/pop options for a stack.
 *
 * The platform's own transition unless Reduce Motion is on, and then a fade —
 * which is the one substitution the setting actually asks for. A push is a
 * hierarchy and has to say so; what somebody with the setting on is opting out
 * of is the travel, not the fact that a new screen arrived.
 *
 * `animation: 'default'` rather than a curve of our own: a screen transition is
 * the one piece of motion in the app that should feel like the phone rather
 * than like us, and it is also the only one with a back-swipe attached to it.
 */
export function useStackChrome() {
  const reduceMotion = useReducedMotion();

  return {
    ...stackChrome,
    animation: reduceMotion ? ("fade" as const) : ("default" as const),
  };
}

/** The root navigator's options — no header, same Reduce Motion rule. */
export function useRootStackAnimation() {
  const reduceMotion = useReducedMotion();
  return reduceMotion ? ("fade" as const) : ("default" as const);
}
