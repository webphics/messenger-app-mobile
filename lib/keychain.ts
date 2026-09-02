import * as SecureStore from "expo-secure-store";

/**
 * The Session cookie's only home on the device.
 *
 * Every operation degrades rather than throws. `expo-secure-store` is a native
 * module: in Expo Go on some platforms, on web, and on a device whose keystore
 * is in a bad state, its calls reject. None of those are worth a crash — a read
 * that cannot answer is indistinguishable from having no cookie, and a write that
 * cannot land leaves the person signed in for this run and signing in again next
 * time. Callers get a boolean when it matters and never a rejection.
 */

/** Namespaced so it cannot collide with anything a later feature stores. */
export const SESSION_COOKIE_KEY = "enki.session_cookie";

/**
 * The key the previous slice of Phase 3a stored its credential under.
 *
 * What is in it cannot authenticate anything any more. An install upgraded from
 * that slice would otherwise keep it in the keystore indefinitely, with nothing
 * left in the app that would ever read or remove it.
 */
const RETIRED_CREDENTIAL_KEY = "enki.session_token";

/** The stored Session cookie, or null when there is none and when the keystore cannot say. */
export async function readSessionCookie(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(SESSION_COOKIE_KEY);
    if (typeof stored !== "string") return null;
    const trimmed = stored.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

/** True when the cookie is on disk; false when the keystore refused it. */
export async function writeSessionCookie(cookie: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SESSION_COOKIE_KEY, cookie);
    return true;
  } catch {
    return false;
  }
}

/** True when nothing is left behind; false when the keystore refused to delete. */
export async function clearSessionCookie(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(SESSION_COOKIE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove what the retired key holds, best-effort and silent.
 *
 * A failure leaves a dead value in the keystore for one more launch, which is
 * exactly where it already was — not worth a boolean anyone would act on.
 */
export async function clearRetiredCredential(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RETIRED_CREDENTIAL_KEY);
  } catch {
    // See above: nothing here is recoverable and nothing downstream reads it.
  }
}
