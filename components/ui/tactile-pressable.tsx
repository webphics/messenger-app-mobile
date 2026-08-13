import React from "react";
import {
  GestureResponderEvent,
  Pressable,
  type PressableProps,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { hapticLight, hapticMedium, hapticSelection } from "@/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 380,
  mass: 0.45,
};

export type TactilePressableProps = PressableProps & {
  activeScale?: number;
  haptic?: "light" | "medium" | "selection" | "none";
};

export const TactilePressable = React.forwardRef<
  React.ComponentRef<typeof Pressable>,
  TactilePressableProps
>(function TactilePressable(
  {
    activeScale = 0.97,
    haptic = "light",
    style,
    disabled,
    onPressIn,
    onPressOut,
    onPress,
    ...props
  },
  ref,
) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      scale.value = withSpring(activeScale, SPRING_CONFIG);
      if (haptic === "light") hapticLight();
      else if (haptic === "medium") hapticMedium();
      else if (haptic === "selection") hapticSelection();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!disabled) {
      scale.value = withSpring(1, SPRING_CONFIG);
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
      style={[animatedStyle, style as any]}
      {...props}
    />
  );
});
