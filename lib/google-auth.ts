import type { AuthEvent } from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import { asRecord } from "@/lib/api-envelope";

/**
 * What a Google sign-in attempt came back as, and which auth event that is.
 *
 * The whole of Phase 3 has one seam — the auth state machine — and this is what
 * keeps it at one. Google's outcomes are mapped onto the events `authTransition`
 * already consumes rather than into states of their own, so "a two-factor
 * challenge is refused" and "a rejection leaves nobody signed in" are decided in
 * one place for all three sign-in methods instead of three.
 *
 * Pure, and worth testing for that reason: every question worth asking of this
 * feature — does a cancelled sheet look like a failure, does a refused token
 * leave a session behind — is answered here rather than in the native module.
 */

/** What the native sign-in call produced, before the API has been asked anything. */
export type GoogleAttempt =
  /** An account was picked and Google minted an ID token for it. */
  | { kind: "token"; idToken: string }
  /** The account sheet was dismissed. Not a failure — see `googleAuthEvent`. */
  | { kind: "cancelled" }
  /** Android only: Google Play services are missing, disabled, or too old. */
  | { kind: "no-play-services" }
  /** Google itself would not complete: no network, a misconfigured client, a device refusal. */
  | { kind: "failed" };

/** How the whole attempt ended, including the exchange with our own API. */
export type GoogleResult =
  | Exclude<GoogleAttempt, { kind: "token" }>
  /** The ID token reached the API and it answered. */
  | { kind: "settled"; outcome: AuthOutcome };

/**
 * The code the native module rejects with when Play services cannot serve the
 * request. The one error code worth naming here: it is the same literal on both
 * platforms (`RNGoogleSigninModule.java`, `RNGoogleSignin.mm`), unlike
 * cancellation, whose code is a platform-specific number the library already
 * translates into a `cancelled` *response* before it reaches us.
 */
const PLAY_SERVICES_NOT_AVAILABLE = "PLAY_SERVICES_NOT_AVAILABLE";

export const NO_PLAY_SERVICES_NOTICE =
  "Google sign-in needs Google Play services, which this device does not have or " +
  "needs to update. Sign in with your email instead.";

/**
 * Deliberately says nothing about which half went wrong. From here a dead
 * network, a client identifier the Google console does not know, and an
 * Android build signed with the wrong certificate are one condition — and
 * guessing between them on screen would send people to check a connection that
 * is fine.
 */
export const GOOGLE_FAILED_NOTICE =
  "Could not finish signing in with Google. Try again, or sign in with your email.";

/**
 * Read what `GoogleSignin.signIn()` resolved with.
 *
 * A success with no ID token is a failure, not a success: the token is the
 * entire point of the call, and there is nothing to send without it.
 */
export function interpretGoogleResponse(response: unknown): GoogleAttempt {
  const record = asRecord(response);

  if (record?.type === "cancelled") return { kind: "cancelled" };

  if (record?.type === "success") {
    const idToken = asRecord(record.data)?.idToken;
    if (typeof idToken === "string" && idToken.trim() !== "") {
      return { kind: "token", idToken };
    }
  }

  return { kind: "failed" };
}

/** Read what `GoogleSignin.signIn()` or `hasPlayServices()` rejected with. */
export function interpretGoogleFailure(error: unknown): GoogleAttempt {
  return asRecord(error)?.code === PLAY_SERVICES_NOT_AVAILABLE
    ? { kind: "no-play-services" }
    : { kind: "failed" };
}

/**
 * The auth event a finished attempt is, or null when it was not an attempt.
 *
 * Null is what makes cancellation distinguishable, and it has to be null rather
 * than any event at all. Dismissing the account sheet must leave the sign-in
 * screen exactly as it was found — nothing typed cleared, and no standing
 * message swept away either, including the one explaining a session that
 * expired a moment ago. Every event this machine has changes something: even
 * `sign-out` lands on signed-out with the notice discarded. So the honest answer
 * for "they closed it" is that nothing happened, and the caller dispatches
 * nothing.
 *
 * The native failures become `server-error` rather than `unauthorised` for a
 * reason the machine cares about: `unauthorised` is the only outcome allowed to
 * erase a stored Session cookie, and nothing that happened inside Google is
 * evidence about a credential this app already holds.
 */
export function googleAuthEvent(result: GoogleResult): AuthEvent | null {
  switch (result.kind) {
    case "cancelled":
      return null;
    case "no-play-services":
      return {
        type: "settled",
        outcome: { kind: "server-error", message: NO_PLAY_SERVICES_NOTICE },
      };
    case "failed":
      return {
        type: "settled",
        outcome: { kind: "server-error", message: GOOGLE_FAILED_NOTICE },
      };
    case "settled":
      return { type: "settled", outcome: result.outcome };
  }
}
