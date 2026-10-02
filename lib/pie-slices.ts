import { colors } from '@/lib/tokens'
import type { ChartSlice } from '@/lib/types'

/**
 * Categorical ramp for pie/donut charts. Deliberately decoupled from the
 * semantic palette (`colors.amber` / `colors.danger`) — after the ember
 * recolour, primary/amber/danger are all warm oranges with pairwise contrast
 * as low as ~1.14:1, which collapses under deuteranopia and on charts that
 * render without a text legend. `#F2A93B` (gold) and `#3D3129` (graphite) are
 * chart-only literals chosen for luminance spread against primary/success;
 * they are NOT app theme tokens. Do not add them to global.css or
 * lib/tokens.ts, and do not re-point this ramp at colors.amber/colors.danger.
 */
export const SLICE_COLORS = [
  colors.primary, // ChatRoute lavender
  colors.success, // sage
  '#F2A93B', // gold
  '#3D3129', // graphite
] as const

export type DrawnSlice = ChartSlice & {
  startAngle: number
  sweep: number
}

export function pieSlices(items: ChartSlice[]): DrawnSlice[] {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) {
    return items.map((item) => ({ ...item, startAngle: 0, sweep: 0 }))
  }
  let start = -Math.PI / 2
  return items.map((item) => {
    const sweep = (item.value / total) * Math.PI * 2
    const slice = { ...item, startAngle: start, sweep }
    start += sweep
    return slice
  })
}

export function polarPoint(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

export function piePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  sweep: number,
): string {
  if (sweep <= 0) return ''
  if (sweep >= Math.PI * 2 - 1e-6) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
  }
  const start = polarPoint(cx, cy, r, startAngle)
  const end = polarPoint(cx, cy, r, startAngle + sweep)
  const large = sweep > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`
}

export function donutPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startAngle: number,
  sweep: number,
): string {
  if (sweep <= 0) return ''
  const outerStart = polarPoint(cx, cy, outer, startAngle)
  const outerEnd = polarPoint(cx, cy, outer, startAngle + sweep)
  const innerStart = polarPoint(cx, cy, inner, startAngle)
  const innerEnd = polarPoint(cx, cy, inner, startAngle + sweep)
  const large = sweep > Math.PI ? 1 : 0
  return `M ${outerStart.x} ${outerStart.y} A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y} Z`
}
