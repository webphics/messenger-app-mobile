import type { AuthOutcome } from "@/lib/auth-response";
import type { SessionUser } from "@/lib/types";

/**
 * What being signed in means, as a transition function.
 *
 * No I/O and no timers: the keychain read, the HTTP call, and the navigation all
 * happen around this, and hand it their results as events. That is what makes
 * "a second tap while the first request is in flight does nothing" and "a 401 at
 * cold start is not the same as a dead network" testable as a table instead of
 * as a race you try to reproduce.
 */

export type AuthState =
  /** Cold start: a stored cookie is being read and checked. */
  | { status: "hydrating" }
  /** No credential. `notice` is what to say about why, when there is anything to say. */
  | { status: "signed-out"; notice: string | null }
  /** A sign-in request is in flight. The only state a second submit cannot leave. */
  | { status: "submitting" }
  | { status: "signed-in"; user: SessionUser }
  /** A cookie exists but the API did not answer. The cookie is kept; a retry is offered. */
  | { status: "unreachable" };

export type AuthEvent =
  /** Hydration settled. `outcome: null` means there was no stored cookie to check. */
  | { type: "hydrated"; outcome: AuthOutcome | null }
  | { type: "submit" }
  | { type: "settled"; outcome: AuthOutcome }
  | { type: "sign-out" }
  /**
   * An authenticated request came back unauthorised: the Session cookie stopped
   * being accepted while the app was in use. Not a `sign-out` — nobody asked, so
   * the person is owed an explanation rather than a bare sign-in screen.
   */
  | { type: "expired" }
  /** Try hydration again after an Unreachable outcome. */
  | { type: "retry" };

export const INITIAL_AUTH_STATE: AuthState = { status: "hydrating" };

/**
 * Deliberately a refusal rather than a broken flow: the handoff between
 * password-accepted and code-verified rides a short-lived cookie this client
 * could now carry, but the second step has no screen and no work behind it yet.
 * See ADR-0004.
 */
export const TWO_FACTOR_NOTICE =
  "This account uses two-factor authentication, which this app does not support yet. Sign in on the web app.";

/**
 * The API's sessions are a seven-day sliding window with no refresh token, so
 * this is what time passing looks like from in here. Worded as something that
 * happened rather than something they did wrong, and shown because the
 * alternative — screens quietly emptying out — is the failure this exists to
 * prevent.
 */
export const EXPIRED_NOTICE = "Your session expired. Sign in again.";

export const OFFLINE_NOTICE =
  "Could not reach the server. Check your connection and try again.";

export const UNREADABLE_NOTICE =
  "The server sent a response this app could not read. Try again.";

const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };

/** What a settled sign-in attempt leaves behind. */
function afterAttempt(outcome: AuthOutcome): AuthState {
  switch (outcome.kind) {
    case "signed-in":
      return { status: "signed-in", user: outcome.user };
    case "two-factor":
      return { status: "signed-out", notice: TWO_FACTOR_NOTICE };
    case "unauthorised":
    case "server-error":
      return { status: "signed-out", notice: outcome.message };
    case "transport-failure":
      return { status: "signed-out", notice: OFFLINE_NOTICE };
    case "malformed":
      return { status: "signed-out", notice: UNREADABLE_NOTICE };
  }
}

/** What a settled hydration leaves behind. */
function afterHydration(outcome: AuthOutcome | null): AuthState {
  if (outcome === null) return SIGNED_OUT;

  switch (outcome.kind) {
    case "signed-in":
      return { status: "signed-in", user: outcome.user };
    // A cookie the server rejected is simply gone. Nothing was typed, so there is
    // nothing to explain — showing an error for an expired cookie would blame the
    // person for time passing.
    case "unauthorised":
      return SIGNED_OUT;
    // Unreachable, not signed out: the cookie may well be good, so it is kept and
    // the person is offered a retry rather than a sign-in screen. A 500 belongs
    // here and not above — being signed out because a deploy went wrong is the
    // same wrongful sign-out Unreachable exists to prevent, arriving by another
    // door.
    case "transport-failure":
    case "server-error":
    case "malformed":
      return { status: "unreachable" };
    // The session endpoint issues no challenge, so this cannot arrive today.
    // Handled anyway so the union stays exhaustive if that ever changes.
    case "two-factor":
      return { status: "signed-out", notice: TWO_FACTOR_NOTICE };
  }
}

export function authTransition(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    // Signing out wins from anywhere, including mid-request: the person asked.
    case "sign-out":
      return SIGNED_OUT;

    // Wins from anywhere too, and for a harder reason than sign-out: by the time
    // this arrives `lib/auth-service` has already discarded the credential. Any
    // state that is not signed-out is then a state claiming a session that no
    // longer exists — including a hydration or a sign-in still in flight, whose
    // success would otherwise land afterwards and sign someone in with nothing in
    // the keychain to back it. A 401 belonging to a session that had already ended
    // never reaches here: the epoch check in `authenticatedRequest` drops it
    // before it is reported, so anything that does arrive cleared a live cookie.
    case "expired":
      return { status: "signed-out", notice: EXPIRED_NOTICE };

    case "hydrated":
      return state.status === "hydrating" ? afterHydration(event.outcome) : state;

    // The double-submit guard. A second tap arrives while `submitting`, which is
    // not `signed-out`, so it changes nothing and starts no second request.
    case "submit":
      return state.status === "signed-out" ? { status: "submitting" } : state;

    // A response that outlived its request — the person signed out while it was in
    // flight — must not sign them back in.
    case "settled":
      return state.status === "submitting" ? afterAttempt(event.outcome) : state;

    case "retry":
      return state.status === "unreachable" ? { status: "hydrating" } : state;
  }
}
