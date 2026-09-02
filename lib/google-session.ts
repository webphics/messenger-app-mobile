import { GoogleSignin } from "@react-native-google-signin/google-signin";

import { GOOGLE_OAUTH } from "@/lib/google-config";
import {
  interpretGoogleFailure,
  interpretGoogleResponse,
  type GoogleAttempt,
} from "@/lib/google-auth";

/**
 * The native module's only door into this app.
 *
 * Kept to one file for the same reason `lib/keychain` is: this is the boundary
 * that does not run in Expo Go and cannot run under Jest at all —
 * `TurboModuleRegistry.getEnforcing` throws at import when the native side is
 * absent. Everything worth deciding is decided in `lib/google-auth`, which is
 * pure; what is left here is the sequence of calls, which is wiring.
 *
 * Nothing here throws. A caller gets a `GoogleAttempt` or, for the two
 * housekeeping calls, nothing at all.
 */

/**
 * The library's `configure` is synchronous and cheap, but it is also global
 * state, so it is done once rather than on every tap.
 */
let configured = false;

function configure(): boolean {
  if (!GOOGLE_OAUTH) return false;
  if (configured) return true;

  GoogleSignin.configure({
    // Both, and the web one is not a mistake: it is what makes the ID token's
    // audience the value the API already verifies against, so mobile Google
    // sign-in needs no server change. Deleting it breaks verification in a way
    // that looks like a credential problem. See `lib/google-config` and
    // `docs/adr/ADR-0005-the-google-audience-arrangement.md`.
    webClientId: GOOGLE_OAUTH.webClientId,
    ...(GOOGLE_OAUTH.iosClientId ? { iosClientId: GOOGLE_OAUTH.iosClientId } : {}),
  });
  configured = true;
  return true;
}

/**
 * Show the account sheet and come back with an ID token, or with why not.
 *
 * `hasPlayServices` first, and with the update dialog on: on Android the useful
 * thing to do about missing Play services is to offer the update, and finding
 * out afterwards means the sheet has already failed in a way that reads as the
 * app's fault.
 */
export async function requestGoogleIdToken(): Promise<GoogleAttempt> {
  if (!configure()) return { kind: "failed" };

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    return interpretGoogleResponse(await GoogleSignin.signIn());
  } catch (error) {
    return interpretGoogleFailure(error);
  }
}

/**
 * Let go of the account the device is holding.
 *
 * Without this a shared or handed-over device signs the previous person straight
 * back in: the next tap finds a live native session and skips the picker
 * entirely. Deliberately `signOut` rather than `revokeAccess` — this releases the
 * app's hold on the account, it does not withdraw the permission the person
 * granted, which they did not ask to undo.
 *
 * Swallows its own failure. There is no session left here by the time this runs,
 * so a native module that will not answer must not be the reason signing out
 * appears to fail.
 */
export async function releaseGoogleSession(): Promise<void> {
  // Configured first because this is reachable without anyone having tapped the
  // Google button in this run: signing out releases the native session whatever
  // signed the person in, and an unconfigured native module has no session to
  // let go of.
  if (!configure()) return;

  try {
    await GoogleSignin.signOut();
  } catch {
    // Nothing to do and nobody to tell: the Session cookie is already gone.
  }
}
