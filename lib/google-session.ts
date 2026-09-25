import type { GoogleSignin as GoogleSigninModule } from "@react-native-google-signin/google-signin";
import { TurboModuleRegistry } from "react-native";

import { GOOGLE_CONFIG } from "@/lib/google-config";
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
 * The library, or null when this binary was built without its native half.
 *
 * Loaded by `require` behind a check rather than by a static import, because the
 * library's own entry calls `TurboModuleRegistry.getEnforcing("RNGoogleSignin")`
 * at import and that throws when the module is absent. A static import put the
 * throw at app start: this file is reached from the root layout through
 * `auth-service`, so Expo Go, or a development client built before Google
 * sign-in was added, died on launch instead of running everything but Google.
 * `TurboModuleRegistry.get` asks the same question and answers null.
 */
const GoogleSignin: typeof GoogleSigninModule | null =
  TurboModuleRegistry.get("RNGoogleSignin") === null
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@react-native-google-signin/google-signin").GoogleSignin;

/**
 * Why this binary cannot offer Google sign-in, or null when it can. Separate
 * from `GOOGLE_CONFIG`'s notice: that one is about `.env`, and rebuilding with
 * the right variables does not help here. What helps is a binary that has the
 * module in it.
 */
export const GOOGLE_NATIVE_NOTICE: string | null =
  GoogleSignin === null
    ? "Google sign-in is not in this build of the app. It needs the development " +
      "client, not Expo Go. Sign in with your email instead."
    : null;

if (__DEV__ && GoogleSignin === null) {
  console.warn(
    "[auth] RNGoogleSignin is not in this native binary. Google sign-in is off; " +
      "build a development client (eas build --profile development) to use it.",
  );
}

/**
 * The library's `configure` is synchronous and cheap, but it is also global
 * state, so it is done once rather than on every tap.
 */
let configured = false;

function configure(): typeof GoogleSigninModule | null {
  if (GoogleSignin === null) return null;
  if (GOOGLE_CONFIG.kind !== "configured") return null;
  if (configured) return GoogleSignin;

  const { webClientId, iosClientId } = GOOGLE_CONFIG.oauth;
  GoogleSignin.configure({
    // Both, and the web one is not a mistake: it is the same identifier the web
    // client signs in with and the API verifies against, and handing it here is
    // what makes the ID token's audience that value — so mobile Google sign-in
    // needs no server change. Deleting it breaks verification in a way that
    // looks like a credential problem. See `lib/google-config` and
    // `docs/adr/ADR-0005-the-google-audience-arrangement.md`.
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
  });
  configured = true;
  return GoogleSignin;
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
  const google = configure();
  if (!google) return { kind: "failed" };

  try {
    await google.hasPlayServices({ showPlayServicesUpdateDialog: true });
    return interpretGoogleResponse(await google.signIn());
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
  const google = configure();
  if (!google) return;

  try {
    await google.signOut();
  } catch {
    // Nothing to do and nobody to tell: the Session cookie is already gone.
  }
}
