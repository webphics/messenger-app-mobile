export type Point = { x: number; y: number }

export function linePoints(
  series: number[],
  width: number,
  height: number,
  pad = 4,
): Point[] {
  if (series.length === 0 || width <= 0 || height <= 0) return []
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const span = hi - lo || 1
  const usable = Math.max(height - pad * 2, 1)
  return series.map((v, i) => ({
    x: series.length === 1 ? width / 2 : (i / (series.length - 1)) * width,
    y: pad + (1 - (v - lo) / span) * usable,
  }))
}
