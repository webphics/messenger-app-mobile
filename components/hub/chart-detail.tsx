import { Info } from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { MetricChart } from "@/components/hub/metric-chart";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { colors } from "@/lib/tokens";
import type { ChartMetric } from "@/lib/types";

type ChartDetailProps = {
  chart: ChartMetric;
};

export function ChartDetail({ chart }: ChartDetailProps) {
  const { width } = useWindowDimensions();
  const plotWidth = Math.max(width - 64, 160);
  const plotHeight =
    chart.kind === "pie" || chart.kind === "donut" ? Math.min(plotWidth, 220) : 180;
  const isPositive = chart.deltaLabel.startsWith("+");
  const isNegative = chart.deltaLabel.startsWith("-");

  return (
    <ScrollView
      className="flex-1 bg-bg"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-4 py-4"
    >
      <View className="rounded-3xl border border-line bg-surface p-5 shadow-md shadow-black/5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              {chart.title}
            </Text>
            <Text className="mt-1 font-sans text-3xl font-extrabold text-ink">
              {chart.value}
            </Text>
          </View>
          <View
            className={cn(
              "rounded-full px-3 py-1",
              isPositive
                ? "bg-success/15"
                : isNegative
                  ? "bg-danger/15"
                  : "bg-line/80",
            )}
          >
            <Text
              className={cn(
                "font-sans text-xs font-bold",
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

        <View className="my-6 items-center justify-center">
          <MetricChart
            chart={chart}
            width={plotWidth}
            height={plotHeight}
            showLegend={chart.kind === "pie" || chart.kind === "donut"}
          />
        </View>

        {chart.hint ? (
          <View className="flex-row items-start gap-2.5 rounded-2xl bg-primary-soft/60 p-3.5">
            <Info color={colors.primary} size={18} className="mt-0.5" />
            <Text className="flex-1 font-sans text-sm font-medium leading-5 text-ink-soft">
              {chart.hint}
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
