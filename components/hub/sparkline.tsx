import { View } from "react-native";

import { barHeights } from "@/lib/bar-heights";

type SparklineProps = {
  series: number[];
  height?: number;
};

export function Sparkline({ series, height = 56 }: SparklineProps) {
  const heights = barHeights(series);
  const maxHeight = Math.max(...heights, 1);

  return (
    <View className="flex-row items-end gap-1.5" style={{ height }}>
      {heights.map((h, i) => {
        const isPeak = h === maxHeight;
        const barH = Math.max(4, (h / 100) * height);
        return (
          <View
            key={i}
            className="min-w-0 flex-1 justify-end rounded-full bg-primary-soft/40"
            style={{ height }}
          >
            <View
              className={`w-full rounded-full ${isPeak ? "bg-primary" : "bg-primary/65"}`}
              style={{ height: barH }}
            />
          </View>
        );
      })}
    </View>
  );
}
