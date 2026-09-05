import * as SecureStore from "expo-secure-store";

import { parseKeptPerson, serialiseKeptPerson } from "@/lib/kept-person";
import type { SessionUser } from "@/lib/types";

/**
 * The Session cookie's only home on the device, and the signed-in person's.
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
 * The Kept person: who the cookie above belongs to, as this device last heard it.
 *
 * Beside the cookie rather than in the Store, because it is part of the
 * credential rather than part of what the credential can read: it lives and dies
 * with the cookie, in the same keystore, and `forgetCredential` takes both. See
 * `docs/adr/ADR-0010-a-kept-person-answers-an-unreachable-hydration.md`.
 */
export const KEPT_PERSON_KEY = "enki.session_user";

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

/** The Kept person, or null when nobody is kept and when the keystore cannot say. */
export async function readKeptPerson(): Promise<SessionUser | null> {
  try {
    const stored = await SecureStore.getItemAsync(KEPT_PERSON_KEY);
    return parseKeptPerson(typeof stored === "string" ? stored : null);
  } catch {
    return null;
  }
}

/**
 * Put the signed-in person down beside their cookie.
 *
 * No boolean, unlike the cookie: a write that would not land costs the next cold
 * start its Stale session and nothing more — Hydration falls back to Unreachable,
 * which is exactly where it was before there was a Kept person to read.
 */
export async function writeKeptPerson(user: SessionUser): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEPT_PERSON_KEY, serialiseKeptPerson(user));
  } catch {
    // See above: nothing downstream can act on this failing.
  }
}

/**
 * Remove the Kept person.
 *
 * Silent for the same reason `clearSessionCookie` is not: that one is the
 * credential, and this one cannot authenticate anything on its own. A delete the
 * keystore refuses leaves a name and an email behind, which the next Hydration
 * will only ever read alongside a cookie it has just been handed.
 */
export async function clearKeptPerson(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEPT_PERSON_KEY);
  } catch {
    // See above.
  }
}
