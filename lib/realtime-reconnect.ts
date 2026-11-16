/** One reconnect per this window. A refused reconnect inside it is final. */
export const SERVER_HANG_UP_RETRY_WINDOW_MS = 30_000

/**
 * Whether a socket the server just closed should try once more.
 *
 * Since 2026-11-06 the API closes a socket when its session ends and when an
 * admin changes the person's role, password or two-factor
 * (`api/docs/api/conversations.md`, "When the server hangs up"), and a password
 * change here replaces this device's own session. `socket.io-client` never
 * reconnects after a server close by itself, so without this the app would stop
 * hearing anything until it was restarted. One reconnect, with the cookie the
 * app holds now, picks up the new session or the new role. A session that really
 * ended is refused, and the window stops a second try, so this cannot loop.
 *
 * Pure and imports nothing native, so it is table-tested with a fixed `now`.
 */
export function shouldRetryAfterServerHangUp(
  reason: string,
  lastRetryAt: number | null,
  now: number,
): boolean {
  if (reason !== 'io server disconnect') return false
  return lastRetryAt === null || now - lastRetryAt >= SERVER_HANG_UP_RETRY_WINDOW_MS
}

/**
 * Whether a return to the foreground should replace the socket (BUG-29).
 *
 * iOS suspends the app soon after it leaves the screen, and the socket goes with
 * it without closing: `socket.io-client` still reports it connected, and only
 * notices it is dead when a ping goes unanswered, up to 45 seconds later with the
 * server's defaults. Everything sent in that time is sent to nobody, so messages
 * from the other side arrive late or only on a manual refresh. A fresh
 * connection on the way back costs one handshake, and its `connect` is a
 * reconnect, which re-reads from REST whatever was missed.
 *
 * Only a return from `background`. iOS reports `inactive` for the notification
 * shade and the app switcher, where nothing was suspended.
 */
export function shouldReconnectOnForeground(previous: string, next: string): boolean {
  return previous === 'background' && next === 'active'
}
