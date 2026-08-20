import { View } from "react-native";
import Animated, { FadeInRight, useReducedMotion } from "react-native-reanimated";

import { MetricChart } from "@/components/hub/metric-chart";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { CARD_MIN_HEIGHT } from "@/lib/offer-metrics";
import { enteringAnimation } from "@/lib/reduced-motion";
import type { ChartMetric } from "@/lib/types";

const PLOT_HEIGHT = 64;

type ChartCardProps = {
  chart: ChartMetric;
  cardWidth: number;
  index: number;
  onPress: () => void;
};

export function ChartCard({ chart, cardWidth, index, onPress }: ChartCardProps) {
  const reduceMotion = useReducedMotion();
  const plotWidth = cardWidth - 32;
  const isPositive = chart.deltaLabel.startsWith("+");
  const isNegative = chart.deltaLabel.startsWith("-");

  return (
    <Animated.View
      entering={enteringAnimation(
        reduceMotion,
        FadeInRight.springify().damping(18).stiffness(180).delay(index * 80),
      )}
      style={{ width: cardWidth }}
    >
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`${chart.title}, ${chart.value}`}
        onPress={onPress}
        className="rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
        style={{ width: cardWidth, minHeight: CARD_MIN_HEIGHT }}
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-muted" numberOfLines={1}>
              {chart.title}
            </Text>
            <Text className="mt-1 font-sans text-2xl font-bold text-ink" numberOfLines={1}>
              {chart.value}
            </Text>
          </View>
          <View
            className={cn(
              "rounded-full px-2 py-0.5",
              isPositive
                ? "bg-success/15"
                : isNegative
                  ? "bg-danger/15"
                  : "bg-line/80",
            )}
          >
            <Text
              className={cn(
                "font-sans text-xs font-semibold",
                isPositive
                  ? "text-success"
                  : isNegative
                    ? "text-danger"
                    : "text-muted",
              )}
            >
              {chart.deltaLabel}
            </Text>
          </View>
        </View>

        <View className="mt-4 items-center justify-center" style={{ height: PLOT_HEIGHT }}>
          <MetricChart chart={chart} width={plotWidth} height={PLOT_HEIGHT} />
        </View>
      </TactilePressable>
    </Animated.View>
  );
}
