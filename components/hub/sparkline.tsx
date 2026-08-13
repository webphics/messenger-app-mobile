import { View } from "react-native";

import { barHeights } from "@/lib/bar-heights";

type SparklineProps = {
  series: number[];
  height?: number;
};

export function Sparkline({ series, height = 56 }: SparklineProps) {
  const heights = barHeights(series);
  return (
    <View className="flex-row items-end gap-1" style={{ height }}>
      {heights.map((h, i) => (
        <View
          key={i}
          className="min-w-0 flex-1 rounded-t-sm bg-primary"
          style={{ height: Math.max(2, (h / 100) * height) }}
        />
      ))}
    </View>
  );
}
