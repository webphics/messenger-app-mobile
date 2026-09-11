import React from "react";
import { View } from "react-native";
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import {
  DOT_SIZE,
  dotDistance,
  dotOffset,
  dotWidth,
  paginationWidth,
} from "@/lib/carousel-dots";
import { colors } from "@/lib/tokens";

type CarouselDotProps = {
  index: number;
  count: number;
  scrollX: SharedValue<number>;
  snap: number;
};

/**
 * One dot, placed rather than laid out.
 *
 * Absolutely positioned and childless, which is what makes the animated `width`
 * free: nothing else has to be measured again when it changes. In a flex row it
 * was a layout pass for every dot on every scroll frame — on the one surface a
 * thumb is already moving. See `lib/carousel-dots` for the geometry.
 */
function CarouselDot({ index, count, scrollX, snap }: CarouselDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const at = scrollX.get();
    // 1 under its own card, 0 a card away — everything below is drawn off it,
    // so the size, the colour and the opacity cannot disagree about which dot
    // is the active one.
    const on = 1 - dotDistance(at, index, snap, count);

    return {
      width: dotWidth(at, index, snap, count),
      transform: [{ translateX: dotOffset(at, index, snap, count) }],
      backgroundColor: interpolateColor(on, [0, 1], [colors.line, colors.primary]),
      opacity: 0.55 + on * 0.45,
    };
  });

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, height: DOT_SIZE },
        animatedStyle,
      ]}
      className="rounded-full"
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
    <View
      className="mt-3.5 self-center"
      style={{ width: paginationWidth(count), height: DOT_SIZE }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CarouselDot
          key={i}
          index={i}
          count={count}
          scrollX={scrollX}
          snap={snap}
        />
      ))}
    </View>
  );
}
