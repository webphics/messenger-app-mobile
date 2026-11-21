/**
 * When an account screen may ask the API who this person is again.
 *
 * Pure and table-tested, beside `lib/use-session-user-refresh`, which owns the
 * moments (a screen opening, the app returning to the foreground) and the call.
 *
 * The two-factor and password screens draw `twoFactorEnabled` and `hasPassword`
 * off the signed-in person, which this device holds from the last time the API
 * was asked. Another device can change either in between: turn two-factor on in
 * the browser and this phone goes on drawing "off", offers to turn it on, and
 * the API refuses. So those screens re-read the person when they open and when
 * the app comes back to the front.
 *
 * Throttled, because both moments can come in a burst: two screens pushed one
 * after the other, or a phone flicked in and out of the app switcher. A read
 * inside the window is skipped rather than queued, since the one before it was
 * recent enough to be the answer.
 *
 * A refusal that names the mismatch (`isStaleTwoFactorStatus` in
 * `lib/two-factor-management`) is not throttled: it is proof the copy is out of
 * date, which is the whole reason the window exists to save a request.
 */

/** Long enough to absorb a burst, short enough that a deliberate return re-reads. */
export const SESSION_REFRESH_INTERVAL_MS = 30_000;

export function shouldRefreshSessionUser(
  lastRefreshAt: number | null,
  now: number,
  intervalMs: number = SESSION_REFRESH_INTERVAL_MS,
): boolean {
  if (lastRefreshAt === null) return true;
  // A clock that moved backwards (a changed time zone, a manual set) reads as
  // "long ago" rather than as a window that never ends.
  if (now < lastRefreshAt) return true;
  return now - lastRefreshAt >= intervalMs;
}
