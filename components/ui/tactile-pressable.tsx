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
} from "react-native-reanimated";

import { hapticLight, hapticMedium, hapticSelection } from "@/lib/haptics";
import { motion } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
    ...props
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      if (!reduceMotion) {
        scale.value = withSpring(activeScale, motion.springs.press);
      }
      if (haptic === "light") hapticLight();
      else if (haptic === "medium") hapticMedium();
      else if (haptic === "selection") hapticSelection();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!disabled && !reduceMotion) {
      scale.value = withSpring(1, motion.springs.press);
    }
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[animatedStyle, style]}
      {...props}
    />
  );
});
