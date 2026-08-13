export function barHeights(
  series: number[],
  minBar = 8,
  maxBar = 100,
): number[] {
  if (series.length === 0) return []
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  if (hi === lo) return series.map(() => (minBar + maxBar) / 2)
  return series.map(
    (v) => minBar + ((v - lo) / (hi - lo)) * (maxBar - minBar),
  )
}
