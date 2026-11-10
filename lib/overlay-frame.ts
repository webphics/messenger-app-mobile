export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type OpenMenuPayload = {
  messageId: string
  /** The bubble sits on the end side. Decides which edge the tray hugs. */
  outgoing: boolean
  /**
   * The viewer wrote it. Not the same as `outgoing`: a colleague's message in a
   * Support DM sits on the end side but is not the viewer's to inspect.
   */
  mine: boolean
  pageX: number
  pageY: number
  width: number
  height: number
}

export type ReactionAnchor = Rect & {
  messageId: string
  outgoing: boolean
  mine: boolean
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
    mine: payload.mine,
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

/** Gap between the reaction bar and the bubble it belongs to. */
export const REACTION_BAR_GAP = 8
/** Keeps the bar off the screen's top edge. */
export const REACTION_BAR_EDGE = 8

/**
 * Where the reaction bar sits: above the bubble, hugging its side, like the
 * long-press bar in the common messengers. A bubble too near the top puts it
 * below instead, and it never drops into `bottomReserve`, the strip the action
 * bar covers.
 */
export function reactionBarStyle(
  rect: Rect,
  outgoing: boolean,
  host: { width: number; height: number },
  barHeight: number,
  bottomReserve: number,
  barWidth = 0,
): { top: number; left?: number; right?: number } {
  const above = rect.y - barHeight - REACTION_BAR_GAP
  const below = rect.y + rect.height + REACTION_BAR_GAP
  const lowest = host.height - bottomReserve - barHeight - REACTION_BAR_GAP
  const preferred = above >= REACTION_BAR_EDGE ? above : below
  const top = Math.max(REACTION_BAR_EDGE, Math.min(preferred, lowest))
  // Hug the bubble's side, but slide inwards rather than run off the far edge.
  const furthest = Math.max(REACTION_BAR_EDGE, host.width - barWidth - REACTION_BAR_EDGE)
  const clamp = (inset: number) => Math.min(Math.max(REACTION_BAR_EDGE, inset), furthest)
  const side = outgoing
    ? { right: clamp(host.width - rect.x - rect.width) }
    : { left: clamp(rect.x) }
  return { top, ...side }
}

export function replyStyle(
  rect: Rect,
  outgoing: boolean,
  hostWidth: number,
): { top: number; left?: number; right?: number } {
  return { top: rect.y + rect.height, ...sideInset(rect, outgoing, hostWidth) }
}
