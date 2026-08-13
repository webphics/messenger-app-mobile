import Svg, { Circle, Defs, LinearGradient, Polygon, Polyline, Stop } from "react-native-svg";

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

  const areaPolygon = points.length > 0
    ? `${points[0]!.x},${height} ${polyline} ${points[points.length - 1]!.x},${height}`
    : "";

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="lineFillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.28" />
          <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.0" />
        </LinearGradient>
      </Defs>

      {areaPolygon ? (
        <Polygon
          points={areaPolygon}
          fill="url(#lineFillGrad)"
        />
      ) : null}

      {polyline ? (
        <Polyline
          points={polyline}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {points.map((p, i) => (
        <Circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 4 : 2.5}
          fill={colors.primary}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}
