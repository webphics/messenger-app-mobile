import type { AuthEvent } from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import { asRecord } from "@/lib/api-envelope";

/**
 * What a Sign in with Apple attempt came back as, and which auth event that is.
 *
 * `lib/google-auth` again, for the same reason: Apple's outcomes are mapped onto
 * the events `authTransition` already consumes, so a dismissed sheet and a
 * refused token are decided here, purely, rather than in the native module.
 */

/** What the native sheet produced, before the API has been asked anything. */
export type AppleAttempt =
  /**
   * The person authorised the app. The name is there only on the first
   * authorisation, and only if they shared it; the ID token never carries one,
   * which is why it travels beside the token.
   */
  | {
      kind: "credential";
      idToken: string;
      authorizationCode: string;
      givenName?: string;
      familyName?: string;
    }
  /** The sheet was dismissed. Not a failure — see `appleAuthEvent`. */
  | { kind: "cancelled" }
  /** Apple would not complete: no network, no Apple ID on the device, a refusal. */
  | { kind: "failed" };

/** How the whole attempt ended, including the exchange with our own API. */
export type AppleResult =
  | Exclude<AppleAttempt, { kind: "credential" }>
  /** The credential reached the API and it answered. */
  | { kind: "settled"; outcome: AuthOutcome };

/**
 * The code `expo-apple-authentication` rejects with when the person closes the
 * sheet. iOS reports a dismissal as an error, unlike Google's library, which
 * resolves with a `cancelled` response.
 */
const REQUEST_CANCELED = "ERR_REQUEST_CANCELED";

/** Says nothing about which half went wrong, for `GOOGLE_FAILED_NOTICE`'s reason. */
export const APPLE_FAILED_NOTICE =
  "Could not finish signing in with Apple. Try again, or sign in with your email.";

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Read what `AppleAuthentication.signInAsync()` resolved with.
 *
 * Both the token and the code are required. The token is the sign-in; the code
 * is what lets the API revoke the grant when the account is deleted, which App
 * Review checks, so a credential missing either is not one to send.
 */
export function interpretAppleCredential(credential: unknown): AppleAttempt {
  const record = asRecord(credential);
  const idToken = nonEmpty(record?.identityToken);
  const authorizationCode = nonEmpty(record?.authorizationCode);
  if (!idToken || !authorizationCode) return { kind: "failed" };

  const fullName = asRecord(record?.fullName);
  const givenName = nonEmpty(fullName?.givenName);
  const familyName = nonEmpty(fullName?.familyName);

  return {
    kind: "credential",
    idToken,
    authorizationCode,
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
  };
}

/** Read what `AppleAuthentication.signInAsync()` rejected with. */
export function interpretAppleFailure(error: unknown): AppleAttempt {
  return asRecord(error)?.code === REQUEST_CANCELED
    ? { kind: "cancelled" }
    : { kind: "failed" };
}

/**
 * The auth event a finished attempt is, or null when it was not an attempt.
 * Exactly `googleAuthEvent`'s rules: a dismissed sheet changes nothing, and a
 * native failure is a `server-error`, never the `unauthorised` that would erase
 * a stored Session cookie.
 */
export function appleAuthEvent(result: AppleResult): AuthEvent | null {
  switch (result.kind) {
    case "cancelled":
      return null;
    case "failed":
      return {
        type: "settled",
        outcome: { kind: "server-error", message: APPLE_FAILED_NOTICE },
      };
    case "settled":
      return { type: "settled", outcome: result.outcome };
  }
}
