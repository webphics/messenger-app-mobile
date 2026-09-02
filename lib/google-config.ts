import { Platform } from "react-native";

/**
 * The OAuth clients Google sign-in runs against, and — the load-bearing part —
 * *which* of them the ID token is minted for.
 *
 * ## The audience arrangement
 *
 * This looks wrong. A mobile app is configured here with a **web** client
 * identifier, and the reflex on reading that is to delete it. Do not.
 *
 * The API verifies a Google ID token's audience against exactly one configured
 * client — `GOOGLE_CLIENT_ID`, which is the web one, because the same API serves
 * the web client and Better Auth registers the Google provider only when a
 * client id *and secret* are configured, and a native client has no secret. A
 * token minted for the iOS or Android client would carry that native client as
 * its `aud` and be rejected by `verifyGoogleIdTokenWithClockSkew`.
 *
 * Google's native sign-in libraries take the web client identifier alongside the
 * platform one, and when given it they mint the ID token with the **web** client
 * as the audience — the value the API already verifies against. So the device
 * produces a token that validates against the server's existing configuration,
 * and mobile Google sign-in ships without an API change or a coordinated
 * release. See `docs/adr/ADR-0005-the-google-audience-arrangement.md`.
 *
 * The value belongs here is not a guess: it is the same identifier the web
 * client puts in `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and the API puts in
 * `GOOGLE_CLIENT_ID`. One client, one audience, three places that name it.
 *
 * ## What each platform needs
 *
 * Android needs only the web client: the native flow is identified by the app's
 * package name plus the signing certificate fingerprint registered against the
 * Android OAuth client, not by an identifier carried in the bundle. iOS needs
 * the iOS client as well, both here and as the reversed URL scheme
 * `app.config.js` writes into the Info.plist.
 *
 * ## Not configured is not a crash
 *
 * Anything missing reports `unconfigured` and the sign-in screen says which
 * variable, against a button that is honestly shut. This mirrors the web client,
 * which marks its client id `.optional()` where `NEXT_PUBLIC_API_URL` is
 * required, and renders no Google section at all without one — the same split
 * this client already draws between `lib/api-config` (throws) and
 * `lib/magic-link-config` (reports null). Google is one of three ways in;
 * taking the app down over it would stop a checkout with no Google credentials
 * from starting at all, including in Expo Go, where the rest of the app is still
 * meant to run.
 *
 * Malformed is the exception and does throw, at import, the way `lib/api-config`
 * does. A value that is set and cannot be a client identifier has no honest
 * reading, and the alternative is a sign-in that fails for a reason no message
 * on screen could give.
 */

/**
 * Read literally, never through a computed key: Metro inlines
 * `process.env.EXPO_PUBLIC_*` by textual substitution at build time, so
 * `process.env[name]` is `undefined` in a release bundle.
 */
const WEB_ENV_VAR = "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID";
const IOS_ENV_VAR = "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID";

export type GoogleOAuth = {
  /**
   * The web client, handed to the native library as `webClientId` on both
   * platforms. This is the audience the minted ID token carries — see above.
   */
  webClientId: string;
  /** The iOS platform client. Null on Android, where none is needed. */
  iosClientId: string | null;
};

/**
 * Either this build can sign someone in with Google, or it can say why not.
 * There is no third state and in particular no silent one.
 */
export type GoogleConfig =
  | { kind: "configured"; oauth: GoogleOAuth }
  | { kind: "unconfigured"; notice: string };

/**
 * What Google issues: a project number, a dash, an opaque part, and the fixed
 * suffix. Matched rather than merely checked for non-emptiness because the two
 * values here are easy to swap for each other or for a client *secret*, and
 * every one of those mistakes is invisible until a token is refused.
 */
const CLIENT_ID = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;

/**
 * Validate one identifier. Empty reads as absent; anything else must parse.
 */
function readClientId(envVar: string, raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;

  if (!CLIENT_ID.test(value)) {
    throw new Error(
      `${envVar} is not a Google OAuth client ID: "${value}". ` +
        "It looks like 123456789012-abc123.apps.googleusercontent.com — copy the " +
        "client ID from the Google Cloud console, not the client secret.",
    );
  }

  return value;
}

/**
 * The configured clients, or the sentence explaining what is missing.
 *
 * Throws only for a value that is present and cannot be a client identifier.
 */
export function readGoogleConfig(
  web: string | undefined,
  ios: string | undefined,
  platform: string,
): GoogleConfig {
  const webClientId = readClientId(WEB_ENV_VAR, web);
  // Validated on every platform, not only iOS: a typo left in `.env` must not
  // wait for someone to switch to a Mac to be discovered.
  const iosClientId = readClientId(IOS_ENV_VAR, ios);

  // Named first and on its own, because it is the one whose absence cannot be
  // worked around: without the web client there is no audience the API will
  // accept, whatever else is set.
  if (!webClientId) {
    return {
      kind: "unconfigured",
      notice:
        `Google sign-in is not configured for this build. Set ${WEB_ENV_VAR} — ` +
        "the same client ID the web client and the API use — and rebuild.",
    };
  }

  if (platform === "ios" && !iosClientId) {
    return {
      kind: "unconfigured",
      notice:
        `Google sign-in needs ${IOS_ENV_VAR} on iOS, for the native flow and the ` +
        "URL scheme that completes it. Set it and rebuild.",
    };
  }

  return { kind: "configured", oauth: { webClientId, iosClientId } };
}

/** Evaluated at import, so a malformed value fails at startup rather than at tap time. */
export const GOOGLE_CONFIG = readGoogleConfig(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  Platform.OS,
);

// The loud half of "not configured is not a crash". A build with no clients is a
// legitimate state — most of this app is developed in Expo Go, where none of
// this can run — so it must not throw; but a developer who *meant* to configure
// Google is owed the reason at startup rather than a disabled button they have
// to reach the sign-in screen to see. Behind `__DEV__`, so a shipped bundle
// carries neither the check nor the sentence.
if (__DEV__ && GOOGLE_CONFIG.kind === "unconfigured") {
  console.warn(`[auth] ${GOOGLE_CONFIG.notice}`);
}
