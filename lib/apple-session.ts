import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import {
  interpretAppleCredential,
  interpretAppleFailure,
  type AppleAttempt,
} from "@/lib/apple-auth";

/**
 * The native module's only door into this app, as `lib/google-session` is
 * Google's. Unlike Google's library this one is safe to import anywhere: it
 * loads its native half with `requireOptionalNativeModule` and answers
 * `isAvailableAsync` with false where there is none — Android, the web, or a
 * development client built before Sign in with Apple was added.
 *
 * Nothing here throws.
 */

/**
 * Whether this device can show the Apple sheet. iOS only, by decision rather
 * than by the library: App Store guideline 4.8 is what asks for it, and on
 * Android it would be a web flow this API does not run.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Show the sheet and come back with a credential, or with why not.
 *
 * Name and email are the only scopes there are, and both are asked for: the
 * person can still withhold the name and hide the address behind a relay one,
 * which is the choice the guideline is about.
 */
export async function requestAppleCredential(): Promise<AppleAttempt> {
  try {
    return interpretAppleCredential(
      await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      }),
    );
  } catch (error) {
    return interpretAppleFailure(error);
  }
}
