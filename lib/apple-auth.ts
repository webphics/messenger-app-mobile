import type { AuthEvent } from "@/lib/auth-machine";
import type { AuthOutcome, HttpOutcome } from "@/lib/auth-response";
import { asRecord } from "@/lib/api-envelope";

/**
 * What a Sign in with Apple attempt came back as, and which auth event that is.
 *
 * `lib/google-auth` again, for the same reason: Apple's outcomes are mapped onto
 * the events `authTransition` already consumes, so a dismissed sheet and a
 * refused token are decided here, purely, rather than in the native module.
 */

/** The name Apple shared, on the one authorisation it shares it. */
export type AppleName = { givenName?: string; familyName?: string };

/** What the native sheet produced, before the API has been asked anything. */
export type AppleAttempt =
  /**
   * The person authorised the app. `appleUserId` is Apple's stable id for this
   * person and app, which is what the remembered name is keyed by. The name is
   * there only on the first authorisation, and only if they shared it.
   */
  | ({
      kind: "credential";
      appleUserId: string;
      idToken: string;
      authorizationCode: string;
    } & AppleName)
  /** The sheet was dismissed. Not a failure — see `appleAuthEvent`. */
  | { kind: "cancelled" }
  /** Apple would not complete: no network, no Apple ID on the device, a refusal. */
  | { kind: "failed" };

/** How the whole attempt ended, including the exchanges with our own API. */
export type AppleResult =
  | Exclude<AppleAttempt, { kind: "credential" }>
  /** The API has no Apple configuration, so the sheet was never opened. */
  | { kind: "unavailable" }
  /** The API answered, or the nonce request never reached it. */
  | { kind: "settled"; outcome: AuthOutcome };

/** What `POST /auth/apple/nonce` came back as. */
export type AppleNonceOutcome =
  | { kind: "nonce"; nonce: string; hashedNonce: string }
  | { kind: "unavailable" }
  | { kind: "unreached" }
  | { kind: "failed" };

/**
 * The code `expo-apple-authentication` rejects with when the person closes the
 * sheet. iOS reports a dismissal as an error, unlike Google's library, which
 * resolves with a `cancelled` response.
 */
const REQUEST_CANCELED = "ERR_REQUEST_CANCELED";

/** The API's code for a deployment with no `APPLE_*` configuration. */
const APPLE_UNAVAILABLE_CODE = "apple_sign_in_unavailable";

/** Says nothing about which half went wrong, for `GOOGLE_FAILED_NOTICE`'s reason. */
export const APPLE_FAILED_NOTICE =
  "Could not finish signing in with Apple. Try again, or sign in with your email.";

/**
 * A server without Apple configured. Said before the sheet opens, so nobody
 * authorises the app only to be told afterwards that it was for nothing.
 */
export const APPLE_UNAVAILABLE_NOTICE =
  "Sign in with Apple is not available right now. Sign in with your email instead.";

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function nameFrom(record: Record<string, unknown> | null): AppleName {
  const givenName = nonEmpty(record?.givenName);
  const familyName = nonEmpty(record?.familyName);

  return {
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
  };
}

/**
 * Read a `POST /auth/apple/nonce` response. The nonce the API keeps and the hash
 * the sheet is opened with must both be there, or there is nothing to sign in with.
 */
export function interpretAppleNonce(outcome: HttpOutcome): AppleNonceOutcome {
  if (!outcome.reached) return { kind: "unreached" };

  const body = asRecord(outcome.body);
  if (body?.code === APPLE_UNAVAILABLE_CODE) return { kind: "unavailable" };

  const data = asRecord(body?.data);
  const nonce = nonEmpty(data?.nonce);
  const hashedNonce = nonEmpty(data?.hashedNonce);
  if (outcome.status >= 200 && outcome.status < 300 && nonce && hashedNonce) {
    return { kind: "nonce", nonce, hashedNonce };
  }

  return { kind: "failed" };
}

/**
 * Read what `AppleAuthentication.signInAsync()` resolved with.
 *
 * The token, the code and the user id are all required. The token is the
 * sign-in; the code is what lets the API revoke the grant when the account is
 * deleted, which App Review checks; the user id is what the name is kept under.
 */
export function interpretAppleCredential(credential: unknown): AppleAttempt {
  const record = asRecord(credential);
  const appleUserId = nonEmpty(record?.user);
  const idToken = nonEmpty(record?.identityToken);
  const authorizationCode = nonEmpty(record?.authorizationCode);
  if (!appleUserId || !idToken || !authorizationCode) return { kind: "failed" };

  return {
    kind: "credential",
    appleUserId,
    idToken,
    authorizationCode,
    ...nameFrom(asRecord(record?.fullName)),
  };
}

/** Read what `AppleAuthentication.signInAsync()` rejected with. */
export function interpretAppleFailure(error: unknown): AppleAttempt {
  return asRecord(error)?.code === REQUEST_CANCELED
    ? { kind: "cancelled" }
    : { kind: "failed" };
}

/** Whether a name has anything in it worth keeping or sending. */
export function hasAppleName(name: AppleName): boolean {
  return name.givenName !== undefined || name.familyName !== undefined;
}

/**
 * The name to send: the one Apple shared this time, or the one kept from the
 * authorisation that shared it. Apple shares a name once, so when that first
 * attempt never reached a signed-in account — the API was down, the person
 * closed the app — the kept copy is the only one left.
 */
export function appleNameToSend(attempt: AppleName, remembered: AppleName | null): AppleName {
  const shared = nameFrom(attempt as Record<string, unknown>);
  return hasAppleName(shared) ? shared : (remembered ?? {});
}

/** The kept name, as the keychain stores it. */
export function serialiseAppleName(name: AppleName): string {
  return JSON.stringify(nameFrom(name as Record<string, unknown>));
}

/** The kept name back, or null for none and for anything unreadable. */
export function parseAppleName(stored: string | null): AppleName | null {
  if (stored === null) return null;
  try {
    const name = nameFrom(asRecord(JSON.parse(stored)));
    return hasAppleName(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * Whether the kept name has done its job: the API now holds an account for
 * this Apple ID, so it never needs the name again. A two-factor challenge
 * counts, since only an existing account can raise one.
 */
export function appleNameSettled(outcome: AuthOutcome): boolean {
  return outcome.kind === "signed-in" || outcome.kind === "two-factor";
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
    case "unavailable":
      return {
        type: "settled",
        outcome: { kind: "server-error", message: APPLE_UNAVAILABLE_NOTICE },
      };
    case "settled":
      return { type: "settled", outcome: result.outcome };
  }
}
