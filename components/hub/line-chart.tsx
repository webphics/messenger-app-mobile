import Svg, { Circle, Polyline } from "react-native-svg";

import { linePoints } from "@/lib/line-points";
import { colors } from "@/lib/tokens";

type LineChartProps = {
  series: number[];
  width: number;
  height: number;
};

export function LineChart({ series, width, height }: LineChartProps) {
  const points = linePoints(series, width, height);
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg width={width} height={height}>
      {polyline ? (
        <Polyline
          points={polyline}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.primary} />
      ))}
    </Svg>
  );
}
