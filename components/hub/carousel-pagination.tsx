import React from "react";
import { View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { colors } from "@/lib/tokens";

type CarouselDotProps = {
  index: number;
  scrollX: SharedValue<number>;
  snap: number;
};

function CarouselDot({ index, scrollX, snap }: CarouselDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * snap, index * snap, (index + 1) * snap];
    const width = interpolate(
      scrollX.value,
      inputRange,
      [6, 24, 6],
      Extrapolation.CLAMP,
    );
    const backgroundColor = interpolateColor(
      scrollX.value,
      inputRange,
      [colors.line, colors.primary, colors.line],
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.55, 1, 0.55],
      Extrapolation.CLAMP,
    );

    return {
      width,
      backgroundColor,
      opacity,
    };
  });

  return (
    <Animated.View
      style={animatedStyle}
      className="h-1.5 rounded-full"
    />
  );
}

type CarouselPaginationProps = {
  count: number;
  scrollX: SharedValue<number>;
  snap: number;
};

export function CarouselPagination({
  count,
  scrollX,
  snap,
}: CarouselPaginationProps) {
  if (count <= 1) return null;

  return (
    <View className="mt-3.5 flex-row justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <CarouselDot
          key={i}
          index={i}
          scrollX={scrollX}
          snap={snap}
        />
      ))}
    </View>
  );
}
