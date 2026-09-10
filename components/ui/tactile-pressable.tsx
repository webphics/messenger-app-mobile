import React from "react";
import {
  GestureResponderEvent,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { hapticLight, hapticMedium, hapticSelection } from "@/lib/haptics";
import { easing } from "@/lib/motion-easing";
import { motion } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * How far a finger may drift off a control before the press is abandoned.
 *
 * Nobody holds still. Without this a press that wandered four pixels is a press
 * that silently did nothing, which reads as the app having missed the tap.
 */
const RETENTION = { top: 12, bottom: 12, left: 12, right: 12 };

/** Dimmed rather than scaled where the system asks for less movement. */
const REDUCED_OPACITY = 0.7;

export type TactilePressableProps = Omit<PressableProps, "style"> & {
  activeScale?: number;
  haptic?: "light" | "medium" | "selection" | "none";
  /** Static styles only — Pressable state callbacks conflict with Reanimated style arrays. */
  style?: StyleProp<ViewStyle>;
};

export const TactilePressable = React.forwardRef<
  React.ComponentRef<typeof Pressable>,
  TactilePressableProps
>(function TactilePressable(
  {
    activeScale = 0.97,
    haptic = "none",
    style,
    disabled,
    onPressIn,
    onPressOut,
    onPress,
    pressRetentionOffset = RETENTION,
    ...props
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      // Reduce Motion means gentler, not nothing: a press with no
      // acknowledgement at all is worse than the scale it replaces, so the
      // control dims instead. Opacity is the one property the setting keeps.
      if (reduceMotion) {
        opacity.set(
          withTiming(REDUCED_OPACITY, {
            duration: motion.durations.feedback,
            easing: easing.out,
          }),
        );
      } else {
        scale.set(withSpring(activeScale, motion.springs.press));
      }
      if (haptic === "light") hapticLight();
      else if (haptic === "medium") hapticMedium();
      else if (haptic === "selection") hapticSelection();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!disabled) {
      if (reduceMotion) {
        opacity.set(
          withTiming(1, {
            duration: motion.durations.feedback,
            easing: easing.out,
          }),
        );
      } else {
        scale.set(withSpring(1, motion.springs.press));
      }
    }
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      pressRetentionOffset={pressRetentionOffset}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[animatedStyle, style]}
      {...props}
    />
  );
});
