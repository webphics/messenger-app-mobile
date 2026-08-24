/**
 * Fit a natural image into a max box without cropping.
 * Used for chat thumbnails (bubble) — preview uses full screen separately.
 */
export function fitImageSize(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const boxW = Math.max(1, maxW)
  const boxH = Math.max(1, maxH)

  if (
    !Number.isFinite(naturalW) ||
    !Number.isFinite(naturalH) ||
    naturalW <= 0 ||
    naturalH <= 0
  ) {
    // Slightly taller than landscape 4:3 while we wait for getSize.
    return { width: Math.round(boxW), height: Math.round(Math.min(boxH, boxW * 1.2)) }
  }

  const aspect = naturalW / naturalH
  let width = boxW
  let height = width / aspect

  if (height > boxH) {
    height = boxH
    width = height * aspect
  }

  // Avoid postage-stamp thumbs for very tall/narrow sources.
  const minW = Math.min(140, boxW)
  if (width < minW) {
    width = minW
    height = Math.min(boxH, width / aspect)
  }

  return { width: Math.round(width), height: Math.round(height) }
}

/**
 * Column width for borderless media + optional caption.
 * Caption must not shrink-wrap to a narrow image — use the bubble max when present.
 */
export function mediaCaptionColumnWidth(
  mediaWidth: number,
  maxBubbleWidth: number,
  hasCaption: boolean,
): number {
  const media = Math.max(0, Math.round(mediaWidth))
  const max = Math.max(1, Math.round(maxBubbleWidth))
  if (!hasCaption) return Math.min(media || max, max)
  return max
}
