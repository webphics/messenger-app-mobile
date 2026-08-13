export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type OpenMenuPayload = {
  messageId: string
  outgoing: boolean
  pageX: number
  pageY: number
  width: number
  height: number
}

export type ReactionAnchor = Rect & {
  messageId: string
  outgoing: boolean
  hostWidth: number
}

export type MeasurableNode = {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void
  measure(
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ): void
}

export const TRAY_X_INSET = 22
export const TRAY_Y_NUDGE = 24

export function isPlausibleRect(
  r: Rect,
  screen: { width: number; height: number },
): boolean {
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) return false
  if (r.width <= 0 || r.height <= 0) return false
  return Math.abs(r.x) <= screen.width * 2 && Math.abs(r.y) <= screen.height * 2
}

/** Bubble window frame minus host origin → overlay-local rect. */
export function overlayFrame(bubble: Rect, host: Rect): Rect {
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
  host: Rect,
): Rect {
  return {
    x: absoluteX - host.x - size.width / 2,
    y: absoluteY - host.y - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

export function measureWindowOrPage(
  node: MeasurableNode,
  screen: { width: number; height: number },
): Promise<Rect> {
  return new Promise((resolve) => {
    node.measureInWindow((x, y, width, height) => {
      const win = { x, y, width, height }
      if (isPlausibleRect(win, screen)) {
        resolve(win)
        return
      }
      node.measure((_lx, _ly, w, h, pageX, pageY) => {
        resolve({ x: pageX, y: pageY, width: w, height: h })
      })
    })
  })
}

export function anchorFromPayload(
  payload: OpenMenuPayload,
  host: Rect,
  screen: { width: number; height: number },
): ReactionAnchor | null {
  if (host.width <= 0 || host.height <= 0) return null
  const bubble: Rect = {
    x: payload.pageX,
    y: payload.pageY,
    width: payload.width,
    height: payload.height,
  }
  const local =
    payload.width > 0 && payload.height > 0 && isPlausibleRect(bubble, screen)
      ? overlayFrame(bubble, host)
      : overlayFrameFromPoint(
          payload.pageX,
          payload.pageY,
          { width: payload.width, height: payload.height },
          host,
        )
  return {
    messageId: payload.messageId,
    outgoing: payload.outgoing,
    ...local,
    hostWidth: host.width,
  }
}

function sideInset(
  rect: Rect,
  outgoing: boolean,
  hostWidth: number,
): { left?: number; right?: number } {
  if (outgoing) {
    return { right: hostWidth - rect.x - rect.width + TRAY_X_INSET }
  }
  return { left: rect.x + TRAY_X_INSET }
}

export function trayStyle(
  rect: Rect,
  outgoing: boolean,
  hostWidth: number,
): { top: number; left?: number; right?: number } {
  return { top: rect.y + rect.height / 2 - TRAY_Y_NUDGE, ...sideInset(rect, outgoing, hostWidth) }
}

export function replyStyle(
  rect: Rect,
  outgoing: boolean,
  hostWidth: number,
): { top: number; left?: number; right?: number } {
  return { top: rect.y + rect.height, ...sideInset(rect, outgoing, hostWidth) }
}
