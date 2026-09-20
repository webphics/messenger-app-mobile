import type { AccountState } from "@/lib/account-state";

/**
 * What the form already knows about an identifier, and for how long.
 *
 * The web client caches the probe through its query cache
 * (`ACCOUNT_STATE_CACHE_MS` in `login-form.tsx`); this app has no query cache on
 * the sign-in screen, so the same rule is written down here instead.
 *
 * It exists so that stepping back to fix a typo and returning to the identifier
 * you first typed is free, rather than spending a second request against a
 * budget sized for a person filling in a form. That budget is real: the API
 * limits this route per identifier as well as per IP.
 *
 * **Five minutes, and the ceiling matters more than the floor.** What it
 * describes does change — somebody can set a password in another tab — and a
 * stale "no password" leaves them looking at a screen that will not accept the
 * password they just chose.
 *
 * Pure and time-injected, so the expiry is a table rather than a flaky test.
 */

export const ACCOUNT_STATE_CACHE_MS = 5 * 60 * 1000;

export type CachedAccountState = {
  /** The identifier as it was sent: trimmed and lower-cased. */
  identifier: string;
  state: AccountState;
  /** When the answer arrived, by `Date.now()`. */
  at: number;
};

/**
 * The cached answer for this identifier, or null when there is none, when it is
 * for a different identifier, or when it has aged out.
 *
 * One entry rather than a map: the form asks about one identifier at a time,
 * and an entry for an identifier nobody is looking at is a probe answer kept
 * past its usefulness.
 */
export function readCachedAccountState(
  cached: CachedAccountState | null,
  identifier: string,
  now: number,
): AccountState | null {
  if (cached === null) return null;
  if (cached.identifier !== identifier) return null;

  // `>=` rather than `>`: an entry exactly at the ceiling has lived its whole
  // life, and the boundary belongs to the side that asks again.
  if (now - cached.at >= ACCOUNT_STATE_CACHE_MS) return null;

  return cached.state;
}

/** The entry to hold after an answer. */
export function cacheAccountState(
  identifier: string,
  state: AccountState,
  now: number,
): CachedAccountState {
  return { identifier, state, at: now };
}
