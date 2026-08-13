export type WindowFrame = {
  x: number
  y: number
  width: number
  height: number
}

export type OverlayRect = {
  x: number
  y: number
  width: number
  height: number
}

export const TRAY_X_INSET = 22
export const TRAY_Y_NUDGE = 24

/** Bubble window frame minus host origin → overlay-local rect. */
export function overlayFrame(bubble: WindowFrame, host: WindowFrame): OverlayRect {
  return {
    x: bubble.x - host.x,
    y: bubble.y - host.y,
    width: bubble.width,
    height: bubble.height,
  }
}

/** Finger + layout size when measureInWindow is unusable. */
export function overlayFrameFromPoint(
  absoluteX: number,
  absoluteY: number,
  size: { width: number; height: number },
  host: WindowFrame,
): OverlayRect {
  return {
    x: absoluteX - host.x - size.width / 2,
    y: absoluteY - host.y - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

export function trayStyle(
  rect: OverlayRect,
  outgoing: boolean,
  hostWidth: number,
): { top: number; left?: number; right?: number } {
  const top = rect.y + rect.height / 2 - TRAY_Y_NUDGE
  if (outgoing) {
    return { top, right: hostWidth - rect.x - rect.width + TRAY_X_INSET }
  }
  return { top, left: rect.x + TRAY_X_INSET }
}

export function replyStyle(
  rect: OverlayRect,
  outgoing: boolean,
  hostWidth: number,
): { top: number; left?: number; right?: number } {
  const top = rect.y + rect.height
  if (outgoing) {
    return { top, right: hostWidth - rect.x - rect.width + TRAY_X_INSET }
  }
  return { top, left: rect.x + TRAY_X_INSET }
}
