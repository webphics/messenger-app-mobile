import { router } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import { CarouselPagination } from "@/components/hub/carousel-pagination";
import { CHART_CARD_MIN_HEIGHT, ChartCard } from "@/components/hub/chart-card";
import { Text } from "@/components/ui/text";
import { chartHref } from "@/lib/hub-routes";
import { offerCardMetrics } from "@/lib/offer-metrics";
import { useAnalytics } from "@/lib/use-analytics";

/**
 * The Admin Hub's charts, drawn from `GET /analytics/overview`.
 *
 * What it reads is `lib/use-analytics`; which charts an overview becomes is
 * `lib/analytics-charts`. This is only the strip they are laid out in, and it
 * shares its metrics with the Hub's other carousel so the two scroll alike.
 *
 * Nothing at all when the read failed with nothing behind it — a heading over an
 * empty strip reads as a section that broke, and the Hub is not where a request
 * is explained. Loading draws card-shaped placeholders so the Hub does not
 * reflow when the numbers land.
 */

/** A card-shaped placeholder, at the chart card's own height. */
function LoadingCard({ cardWidth }: { cardWidth: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="gap-4 rounded-3xl border border-line/70 bg-surface p-4"
      style={{ width: cardWidth, minHeight: CHART_CARD_MIN_HEIGHT }}
    >
      <View className="h-3 w-2/5 rounded-full bg-muted/15" />
      <View className="h-6 w-1/4 rounded-full bg-muted/15" />
      <View className="h-10 w-full rounded-xl bg-muted/10" />
    </View>
  );
}

export function ChartsSection() {
  const { width } = useWindowDimensions();
  const { cardWidth, snap, gap, edgePad } = offerCardMetrics(width);
  const { status, charts } = useAnalytics();
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
  });

  if (status === "unavailable") return null;
  if (status === "ready" && charts.length === 0) return null;

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
        {status === "loading" ? (
          <>
            <LoadingCard cardWidth={cardWidth} />
            <LoadingCard cardWidth={cardWidth} />
          </>
        ) : (
          charts.map((chart) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              cardWidth={cardWidth}
              onPress={() => router.push(chartHref(chart.id))}
            />
          ))
        )}
      </Animated.ScrollView>

      <CarouselPagination
        count={charts.length}
        scrollX={scrollX}
        snap={snap}
      />
    </View>
  );
}
