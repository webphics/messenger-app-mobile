import { Pressable, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";

import { MetricChart } from "@/components/hub/metric-chart";
import { Text } from "@/components/ui/text";
import { CARD_MIN_HEIGHT } from "@/lib/offer-metrics";
import type { ChartMetric } from "@/lib/types";

const PLOT_HEIGHT = 56;

type ChartCardProps = {
  chart: ChartMetric;
  cardWidth: number;
  index: number;
  onPress: () => void;
};

export function ChartCard({ chart, cardWidth, index, onPress }: ChartCardProps) {
  const plotWidth = cardWidth - 32;

  return (
    <Animated.View
      entering={FadeInRight.springify().damping(18).stiffness(180).delay(index * 80)}
      style={{ width: cardWidth }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${chart.title}, ${chart.value}`}
        onPress={onPress}
        className="rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10"
        style={{ width: cardWidth, height: CARD_MIN_HEIGHT }}
      >
        <Text className="font-sans text-sm font-medium text-muted" numberOfLines={1}>
          {chart.title}
        </Text>
        <Text className="mt-1 font-sans text-2xl font-bold text-ink" numberOfLines={1}>
          {chart.value}
        </Text>
        <Text className="mt-0.5 font-sans text-xs font-normal text-muted" numberOfLines={1}>
          {chart.deltaLabel}
        </Text>
        <View className="mt-4" style={{ height: PLOT_HEIGHT }}>
          <MetricChart chart={chart} width={plotWidth} height={PLOT_HEIGHT} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
