import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { donutPath, piePath, pieSlices, SLICE_COLORS } from "@/lib/pie-slices";
import type { ChartSlice } from "@/lib/types";

type PieChartProps = {
  slices: ChartSlice[];
  size: number;
  donut?: boolean;
};

export function PieChart({ slices, size, donut = false }: PieChartProps) {
  const drawn = pieSlices(slices.filter((s) => s.value > 0));
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 2;
  const inner = donut ? outer * 0.55 : 0;

  return (
    <View style={{ width: size, height: size, alignSelf: "center" }}>
      <Svg width={size} height={size}>
        {drawn.map((slice, i) => {
          const d = donut
            ? donutPath(cx, cy, outer, inner, slice.startAngle, slice.sweep)
            : piePath(cx, cy, outer, slice.startAngle, slice.sweep);
          if (!d) return null;
          return (
            <Path
              key={`${slice.label}-${i}`}
              d={d}
              fill={SLICE_COLORS[i % SLICE_COLORS.length]}
            />
          );
        })}
      </Svg>
    </View>
  );
}
