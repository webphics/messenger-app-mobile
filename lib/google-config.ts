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
 * ## What each platform needs
 *
 * Android needs only the web client: the native flow is identified by the app's
 * package name plus the signing certificate fingerprint registered against the
 * Android OAuth client, not by an identifier carried in the bundle. iOS needs
 * the iOS client as well, both here and as the reversed URL scheme
 * `app.config.js` writes into the Info.plist.
 *
 * ## Absent versus malformed
 *
 * Malformed fails at import, the way `lib/api-config` does: a value that is set
 * and cannot be a client identifier is a mistake, and the alternative is a
 * sign-in that fails at tap time for a reason no message on screen could give.
 *
 * Absent does not, and that is a deliberate departure from `lib/api-config`.
 * The API's address is load-bearing for every screen; these two variables are
 * load-bearing for one of three sign-in methods, and taking the app down over
 * them would stop a checkout that has no Google credentials from starting at
 * all — including in Expo Go, where the rest of the app is still meant to run
 * (see the README). Unconfigured reports null, and the sign-in screen says so
 * against the button rather than offering one that cannot work.
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
 * What Google issues: a project number, a dash, an opaque part, and the fixed
 * suffix. Matched rather than merely checked for non-emptiness because the two
 * values here are easy to swap for each other or for a client *secret*, and
 * every one of those mistakes is invisible until a token is refused.
 */
const CLIENT_ID = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;

function malformed(envVar: string, value: string): Error {
  return new Error(
    `${envVar} is not a Google OAuth client ID: "${value}". ` +
      "It looks like 123456789012-abc123.apps.googleusercontent.com — copy the " +
      "client ID from the Google Cloud console, not the client secret.",
  );
}

/**
 * Validate one identifier. Empty reads as absent; anything else must parse.
 */
function readClientId(envVar: string, raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (!CLIENT_ID.test(value)) throw malformed(envVar, value);
  return value;
}

/**
 * The configured clients, or null when this build has none.
 *
 * Half-configured throws rather than reporting null: on iOS a web client with no
 * iOS client is not "Google is not set up here", it is a build that will show an
 * enabled button and fail at the account sheet.
 */
export function readGoogleOAuth(
  web: string | undefined,
  ios: string | undefined,
  platform: string,
): GoogleOAuth | null {
  const webClientId = readClientId(WEB_ENV_VAR, web);
  // Validated on every platform, not only iOS: a typo left in `.env` must not
  // wait for someone to switch to a Mac to be discovered.
  const iosClientId = readClientId(IOS_ENV_VAR, ios);

  if (!webClientId) {
    if (iosClientId) {
      throw new Error(
        `${IOS_ENV_VAR} is set but ${WEB_ENV_VAR} is not. The web client is what ` +
          "the API verifies a Google ID token against, so sign-in cannot work " +
          "without it.",
      );
    }
    return null;
  }

  if (platform === "ios" && !iosClientId) {
    throw new Error(
      `${IOS_ENV_VAR} is not set. iOS needs its own OAuth client for the native ` +
        `flow, alongside ${WEB_ENV_VAR}.`,
    );
  }

  return { webClientId, iosClientId };
}

/** What to say when there is nothing configured. Names the variables, since only a build can fix it. */
export const GOOGLE_UNCONFIGURED_NOTICE =
  `Google sign-in is not configured for this build. Set ${WEB_ENV_VAR} ` +
  `(and ${IOS_ENV_VAR} for iOS) and rebuild.`;

/** Evaluated at import, so a malformed value fails at startup rather than at tap time. */
export const GOOGLE_OAUTH = readGoogleOAuth(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  Platform.OS,
);

// The loud half of "absent does not take the app down". A build with no clients
// is a legitimate state — most of this app is developed in Expo Go, where none
// of this can run — so it must not throw; but a developer who *meant* to
// configure Google is owed the reason at startup rather than a disabled button
// they have to reach the sign-in screen to see. Behind `__DEV__`, so a shipped
// bundle carries neither the check nor the sentence.
if (__DEV__ && GOOGLE_OAUTH === null) {
  console.warn(`[auth] ${GOOGLE_UNCONFIGURED_NOTICE}`);
}
