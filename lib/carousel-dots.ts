/**
 * Where the pagination dots sit, as arithmetic.
 *
 * Pure — no Reanimated — so the invariant the layout rests on can be tabled
 * rather than felt for in a simulator. The dots are absolutely positioned
 * inside a container of fixed width, and that is only correct because the row's
 * total width never changes: what one dot gains as it expands, its neighbour
 * gives up. They are out of flow because a dot that expands by growing a real
 * `width` inside a row is a Yoga pass for the whole row on every scroll frame,
 * and the alternative — a `scaleX` — stretches the pill's corner radius with it.
 */

/** A dot at rest. */
export const DOT_SIZE = 6
/** The dot under the card being read. */
export const DOT_ACTIVE_SIZE = 24
/** Between two dots, whatever size they are. */
export const DOT_GAP = 6

/** The row's width. Constant for a given count, which is the whole point. */
export function paginationWidth(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return DOT_ACTIVE_SIZE + (count - 1) * (DOT_SIZE + DOT_GAP)
}

/**
 * How far dot `index` is from being the active one, as 0 (it is) to 1 (a whole
 * card away or further). Everything else about a dot is drawn off this.
 *
 * Past either end the offset is pinned: pulling the list beyond its last card
 * is a rubber-band, not the last dot shrinking.
 */
export function dotDistance(
  scrollX: number,
  index: number,
  snap: number,
  count: number,
): number {
  'worklet'
  if (!Number.isFinite(scrollX) || snap <= 0 || count <= 0) return 1
  const end = (count - 1) * snap
  const at = scrollX < 0 ? 0 : scrollX > end ? end : scrollX
  const away = Math.abs(at / snap - index)
  return away > 1 ? 1 : away
}

/** How wide dot `index` is — full under its own card, `DOT_SIZE` a card away. */
export function dotWidth(
  scrollX: number,
  index: number,
  snap: number,
  count: number,
): number {
  'worklet'
  const d = dotDistance(scrollX, index, snap, count)
  return DOT_ACTIVE_SIZE - (DOT_ACTIVE_SIZE - DOT_SIZE) * d
}

/** Where dot `index` starts — everything in front of it, plus the gaps. */
export function dotOffset(
  scrollX: number,
  index: number,
  snap: number,
  count: number,
): number {
  'worklet'
  let x = 0
  for (let j = 0; j < index; j += 1) {
    x += dotWidth(scrollX, j, snap, count) + DOT_GAP
  }
  return x
}
