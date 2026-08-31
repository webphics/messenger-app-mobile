import * as SecureStore from "expo-secure-store";

/**
 * The Session token's only home on the device.
 *
 * Every operation degrades rather than throws. `expo-secure-store` is a native
 * module: in Expo Go on some platforms, on web, and on a device whose keystore
 * is in a bad state, its calls reject. None of those are worth a crash — a read
 * that cannot answer is indistinguishable from having no token, and a write that
 * cannot land leaves the person signed in for this run and signing in again next
 * time. Callers get a boolean when it matters and never a rejection.
 */

/** Namespaced so it cannot collide with anything a later feature stores. */
export const SESSION_TOKEN_KEY = "enki.session_token";

/** The stored Session token, or null when there is none and when the keystore cannot say. */
export async function readSessionToken(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    if (typeof stored !== "string") return null;
    const trimmed = stored.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

/** True when the token is on disk; false when the keystore refused it. */
export async function writeSessionToken(token: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** True when nothing is left behind; false when the keystore refused to delete. */
export async function clearSessionToken(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}
