import { View, useWindowDimensions } from "react-native";

import { MetricChart } from "@/components/hub/metric-chart";
import { Text } from "@/components/ui/text";
import type { ChartMetric } from "@/lib/types";

type ChartDetailProps = {
  chart: ChartMetric;
};

export function ChartDetail({ chart }: ChartDetailProps) {
  const { width } = useWindowDimensions();
  const plotWidth = Math.max(width - 64, 160);
  const plotHeight =
    chart.kind === "pie" || chart.kind === "donut" ? Math.min(plotWidth, 220) : 160;

  return (
    <View className="flex-1 bg-bg px-4 py-4">
      <View className="rounded-2xl border border-line bg-surface p-4 shadow-md shadow-black/10">
        <Text className="font-sans text-sm font-medium text-muted">{chart.title}</Text>
        <Text className="mt-1 font-sans text-3xl font-bold text-ink">{chart.value}</Text>
        <Text className="mt-1 font-sans text-sm font-normal text-muted">
          {chart.deltaLabel}
        </Text>
        <View className="mt-6">
          <MetricChart
            chart={chart}
            width={plotWidth}
            height={plotHeight}
            showLegend={chart.kind === "pie" || chart.kind === "donut"}
          />
        </View>
        <Text className="mt-4 font-sans text-sm font-normal leading-5 text-ink-soft">
          {chart.hint}
        </Text>
      </View>
    </View>
  );
}
