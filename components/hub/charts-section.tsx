import { router } from "expo-router";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { ChartCard } from "@/components/hub/chart-card";
import { Text } from "@/components/ui/text";
import { chartHref } from "@/lib/hub-routes";
import { listCharts } from "@/lib/mock-catalog";
import { offerCardMetrics } from "@/lib/offer-metrics";

export function ChartsSection() {
  const { width } = useWindowDimensions();
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);
  const charts = listCharts();

  return (
    <View className="mt-6">
      <View className="px-4">
        <Text className="font-sans text-base font-semibold text-ink">Charts</Text>
      </View>
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          marginTop: 12,
          paddingStart: edgePad,
          paddingEnd: edgePad,
          gap,
        }}
      >
        {charts.map((chart, i) => (
          <ChartCard
            key={chart.id}
            chart={chart}
            cardWidth={cardWidth}
            index={i}
            onPress={() => router.push(chartHref(chart.id))}
          />
        ))}
      </ScrollView>
    </View>
  );
}
