import { useReducedMotion } from "react-native-reanimated";

import { tabChrome } from "@/lib/tokens";

/** Agent/Admin tab screen options — fade between scenes; skip when Reduce Motion is on. */
export function useTabChrome() {
  const reduceMotion = useReducedMotion();

  return {
    ...tabChrome,
    animation: reduceMotion ? ("none" as const) : ("fade" as const),
    transitionSpec: {
      animation: "timing" as const,
      config: { duration: reduceMotion ? 0 : 220 },
    },
  };
}
