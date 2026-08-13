import { View } from "react-native";

import { LineChart } from "@/components/hub/line-chart";
import { PieChart } from "@/components/hub/pie-chart";
import { Sparkline } from "@/components/hub/sparkline";
import { Text } from "@/components/ui/text";
import { SLICE_COLORS } from "@/lib/pie-slices";
import type { ChartMetric } from "@/lib/types";

type MetricChartProps = {
  chart: ChartMetric;
  height: number;
  width: number;
  showLegend?: boolean;
};

export function MetricChart({
  chart,
  height,
  width,
  showLegend = false,
}: MetricChartProps) {
  if (chart.kind === "line") {
    return <LineChart series={chart.series} width={width} height={height} />;
  }
  if (chart.kind === "pie" || chart.kind === "donut") {
    const slices = chart.slices ?? [];
    const size = Math.min(width, height);
    return (
      <View>
        <View style={{ width, height }} className="items-center justify-center">
          <PieChart slices={slices} size={size} donut={chart.kind === "donut"} />
        </View>
        {showLegend ? (
          <View className="mt-3 flex-row items-center justify-center gap-4">
            {slices.map((slice, i) => (
              <View key={slice.label} className="flex-row items-center gap-1.5">
                <View
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                />
                <Text
                  className="font-sans text-sm font-normal text-ink-soft"
                  numberOfLines={1}
                >
                  {slice.label} · {slice.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  return <Sparkline series={chart.series} height={height} />;
}
