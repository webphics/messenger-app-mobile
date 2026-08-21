import { router } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import { CarouselPagination } from "@/components/hub/carousel-pagination";
import { ChartCard } from "@/components/hub/chart-card";
import { Text } from "@/components/ui/text";
import { chartHref } from "@/lib/hub-routes";
import { listCharts } from "@/lib/mock-catalog";
import { offerCardMetrics } from "@/lib/offer-metrics";

export function ChartsSection() {
  const { width } = useWindowDimensions();
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);
  const charts = listCharts();
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  return (
    <View className="mt-6">
      <View className="px-4">
        <Text variant="title" className="text-ink">Analytics & Charts</Text>
      </View>
      <Animated.ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        className="overflow-visible"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 14,
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
      </Animated.ScrollView>

      <CarouselPagination
        count={charts.length}
        scrollX={scrollX}
        snap={snap}
      />
    </View>
  );
}
