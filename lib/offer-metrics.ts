export function offerCardMetrics(screenWidth: number) {
  const cardWidth = Math.round(screenWidth * 0.78)
  const gap = 12
  const edgePad = 0
  return { cardWidth, gap, snap: cardWidth + gap, edgePad }
}
