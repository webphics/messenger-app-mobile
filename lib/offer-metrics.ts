export const CARD_MIN_HEIGHT = 196

export function offerCardMetrics(screenWidth: number) {
  const cardWidth = Math.round(screenWidth * 0.78);
  const gap = 12;
  const edgePad = 16;
  return { cardWidth, gap, snap: cardWidth + gap, edgePad };
}
