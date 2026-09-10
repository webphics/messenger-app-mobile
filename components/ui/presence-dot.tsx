import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { cn } from "@/lib/cn";
import { easing } from "@/lib/motion-easing";
import { motion } from "@/lib/motion";

type PresenceDotProps = {
  className?: string;
  /** Soft breathe — hub presence only; keep inbox dots static. */
  breathe?: boolean;
};

/**
 * Online / live indicator. Optional breathe is for sparse hub surfaces only —
 * do not enable inside long FlatLists (N concurrent loops).
 */
export function PresenceDot({ className, breathe = false }: PresenceDotProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!breathe || reduceMotion) {
      opacity.set(1);
      return;
    }
    // `inOut` and not `out`: a breathe is the one loop in the app with no
    // cause and no end, so both halves should be as soft as each other.
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(0.4, {
            duration: motion.durations.breathe,
            easing: easing.inOut,
          }),
          withTiming(1, {
            duration: motion.durations.breathe,
            easing: easing.inOut,
          }),
        ),
        -1,
        false,
      ),
    );
  }, [breathe, opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      accessibilityLabel="Online"
      style={style}
      className={cn("rounded-full bg-success", className)}
    />
  );
}
