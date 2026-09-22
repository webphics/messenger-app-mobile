import type { AuthOutcome } from "@/lib/auth-response";
import { CHALLENGE_LAPSED_NOTICE } from "@/lib/two-factor-challenge";
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
  | {
      status: "signed-in";
      user: SessionUser;
      /**
       * Whether this session is who the API says it is, or who this device last
       * heard it was.
       *
       * Stale is what a cold start with no network resolves to when there is a
       * Kept person to answer with: the screens open on what this phone already
       * holds instead of on a retry button. Not a different status, deliberately
       * — every screen that asks "is somebody signed in" must say yes, because
       * the whole point is that they draw. What reads this is the refetch that
       * confirms it. See
       * `docs/adr/ADR-0010-a-kept-person-answers-an-unreachable-hydration.md`.
       */
      stale: boolean;
    }
  /**
   * A cookie exists, nobody is kept, and the API did not answer. The cookie is
   * kept; a retry is offered. Since #50 this is the narrower case it always
   * described: a device that has a credential and no idea whose it is.
   */
  | { status: "unreachable" }
  /**
   * The credential was accepted and the account wants a code as well.
   *
   * A state rather than a route, which is the whole of ADR-0013: a half-finished
   * handshake with a held credential that only makes sense mid-flow must not be
   * an address anybody can reach out of order. The sign-in screen already on
   * display renders it off this status.
   *
   * It is also the only state in this union that carries a credential. It is
   * carried here and nowhere else — not in the keychain, not in `api-client`'s
   * held cookie — precisely so that leaving the state is the whole of discarding
   * it, on every way out: signed in, refused, lapsed or cancelled.
   */
  | {
      status: "two-factor";
      /**
       * The `better-auth.two_factor` cookie to present on the verify call, as
       * the `name=value` pair.
       */
      challenge: string;
      /** Whether a code is out. The only state a second code submit cannot leave. */
      verifying: boolean;
      /** What stands over the field, or null when there is nothing to say. */
      notice: string | null;
    };

/** The challenge arm, named because three functions below have to take it whole. */
type ChallengeState = Extract<AuthState, { status: "two-factor" }>;

export type AuthEvent =
  /**
   * Hydration settled. `outcome: null` means there was no stored cookie to check.
   *
   * `kept` is the Kept person read off this device beside that cookie, and it
   * only ever decides the outcomes that say nothing about whether the cookie is
   * still good. It is not a credential and cannot sign anybody in on its own: no
   * cookie is no session however well this device remembers who was here.
   */
  | { type: "hydrated"; outcome: AuthOutcome | null; kept: SessionUser | null }
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
  | { type: "retry" }
  /** A code has been typed and sent. Ignored unless a challenge is waiting for one. */
  | { type: "submit-code" }
  | { type: "code-settled"; outcome: AuthOutcome }
  /**
   * Backing out of code entry. Lands signed-out with nothing said, because
   * nobody needs a thing explained to them that they have just done, and with
   * nothing of the attempt retained — the challenge goes with the state.
   */
  | { type: "cancel-challenge" }
  /**
   * The challenge ran out of time. Dispatched by a clock on this side rather
   * than discovered from a refusal, because the API answers a lapsed challenge
   * and a wrong code identically. See `CHALLENGE_LIFETIME_MS` in
   * `lib/two-factor-challenge`.
   */
  | { type: "challenge-lapsed" }
  /**
   * The API finally answered for a Stale session: this is who it says you are.
   *
   * Replaces the Kept person with the confirmed one in place — no navigation, no
   * spinner, and nothing unmounted. A role that changed while the phone was in a
   * pocket arrives this way, which is the reason the whole user is carried and
   * not just the flag.
   */
  | { type: "confirmed"; user: SessionUser }
  /**
   * An account screen wrote something about this person, and this is who the API
   * says they now are.
   *
   * Separate from `confirmed` rather than folded into it, because the two answer
   * different questions. `confirmed` is about a session nobody has verified: it
   * applies only to a Stale one and its whole job is to stop being Stale. This
   * one is about a session that was never in doubt, where a field on the person
   * changed because they asked for it to.
   *
   * It exists because those fields gate controls. Setting a password makes
   * `hasPassword` true and turning two-factor off makes `twoFactorEnabled`
   * false, and the account rows on Settings read both off this state. Without
   * this, the row that sent somebody to the screen would go on reporting what
   * was true before they got there until something remounted it. See
   * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`.
   */
  | { type: "account-updated"; user: SessionUser };

export const INITIAL_AUTH_STATE: AuthState = { status: "hydrating" };

/**
 * The one place a two-factor challenge lands somewhere that is not the challenge
 * state, and it is a place nothing can actually reach.
 *
 * `GET /auth/session` issues no challenge, so `afterHydration`'s `two-factor`
 * branch cannot arrive today; it exists only so the union stays exhaustive if
 * the API ever changes. The sentence is therefore deliberately neutral: it names
 * the fact and the next move and claims nothing about what this app can do. It
 * used to say the app did not support two-factor and to send people to the web,
 * which since ADR-0013 is no longer true anywhere.
 */
export const TWO_FACTOR_NOTICE =
  "This account needs a code from your authenticator app. Sign in again to enter one.";

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
      return { status: "signed-in", user: outcome.user, stale: false };
    // The credential was right, and the account wants a code as well. Nothing is
    // said on the way in: a correct password followed by an accusation would be
    // this screen blaming somebody for their own account's settings.
    case "two-factor":
      return {
        status: "two-factor",
        challenge: outcome.challenge,
        verifying: false,
        notice: null,
      };
    case "unauthorised":
    case "server-error":
      return { status: "signed-out", notice: outcome.message };
    case "transport-failure":
      return { status: "signed-out", notice: OFFLINE_NOTICE };
    case "malformed":
      return { status: "signed-out", notice: UNREADABLE_NOTICE };
  }
}

/**
 * What a settled code attempt leaves behind.
 *
 * Only a success leaves the challenge. Every other answer stays in it with
 * something to say and `verifying` back to false, which is the whole of "another
 * attempt without restarting the sign-in": the challenge cookie is untouched, so
 * the next code goes to the same handshake rather than to a password step
 * somebody would have to walk through again.
 *
 * A refusal in particular stays. It is the case that looks most like an ending
 * and is not one — the API cannot tell a wrong code from a lapsed challenge, so
 * treating a refusal as the end of the road would throw away a live handshake
 * over a typo.
 */
function afterCode(state: ChallengeState, outcome: AuthOutcome): AuthState {
  switch (outcome.kind) {
    case "signed-in":
      return { status: "signed-in", user: outcome.user, stale: false };
    case "unauthorised":
    case "server-error":
      return { ...state, verifying: false, notice: outcome.message };
    case "transport-failure":
      return { ...state, verifying: false, notice: OFFLINE_NOTICE };
    // `two-factor` is here rather than beside `signed-in` on purpose: the verify
    // route does not raise a second challenge, so an answer that looks like one
    // is an answer this client cannot read. The challenge already in hand is
    // kept rather than replaced, because the lapse clock was armed for that one.
    case "malformed":
    case "two-factor":
      return { ...state, verifying: false, notice: UNREADABLE_NOTICE };
  }
}

/**
 * What a settled hydration leaves behind.
 *
 * `kept` is deliberately consulted in one place: the outcomes that leave the
 * cookie neither confirmed nor refused. A hydration with no cookie at all does
 * not reach it — a person who signed out stays signed out with no network, and a
 * name left in the keystore is not a credential.
 */
function afterHydration(
  outcome: AuthOutcome | null,
  kept: SessionUser | null,
): AuthState {
  if (outcome === null) return SIGNED_OUT;

  switch (outcome.kind) {
    case "signed-in":
      return { status: "signed-in", user: outcome.user, stale: false };
    // A cookie the server rejected is simply gone. Nothing was typed, so there is
    // nothing to explain — showing an error for an expired cookie would blame the
    // person for time passing.
    case "unauthorised":
      return SIGNED_OUT;
    // The cookie may well be good, so it is kept — being signed out because a
    // deploy went wrong, or because a train went into a tunnel, is the wrongful
    // sign-out Unreachable exists to prevent, and a 500 arrives at it by another
    // door than a dead network.
    //
    // What is kept beside the cookie decides which of the two answers this is.
    // With a Kept person the session resolves Stale: none of it is confirmed,
    // and this device can still draw the Conversations it holds for exactly that
    // person rather than offering a retry button in front of them. With nobody
    // kept there is a credential and no idea whose, so there is nothing to
    // restore and nothing to draw — Unreachable, as before.
    case "transport-failure":
    case "server-error":
    case "malformed":
      return kept
        ? { status: "signed-in", user: kept, stale: true }
        : { status: "unreachable" };
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
      return state.status === "hydrating"
        ? afterHydration(event.outcome, event.kept)
        : state;

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

    // The double-submit guard, one state along and for the same reason: a second
    // tap arrives while `verifying`, which is not a challenge waiting for a
    // code, so it changes nothing and starts no second request. The notice goes
    // with the attempt that earned it, exactly as `submit` discards the sign-in
    // screen's.
    case "submit-code":
      return state.status === "two-factor" && !state.verifying
        ? { ...state, verifying: true, notice: null }
        : state;

    // A code's answer that outlived its request — cancelled, signed out, or
    // lapsed while it was in flight — must not sign anybody in, the same rule
    // `settled` follows one state back.
    case "code-settled":
      return state.status === "two-factor" && state.verifying
        ? afterCode(state, event.outcome)
        : state;

    // Nothing is said. Somebody who pressed back knows what they pressed, and
    // the challenge cookie goes with the state rather than being cleaned up.
    case "cancel-challenge":
      return state.status === "two-factor" ? SIGNED_OUT : state;

    // The other way out that keeps nothing, and the only one with something to
    // say. It is a clock on this side, not a reading of a refusal: see
    // `CHALLENGE_LIFETIME_MS`.
    case "challenge-lapsed":
      return state.status === "two-factor"
        ? { status: "signed-out", notice: CHALLENGE_LAPSED_NOTICE }
        : state;

    // Only ever against a Stale session. A confirmation arriving for one that is
    // already confirmed changes nothing, and one arriving after a sign-out or an
    // expiry must not sign anybody back in — the same rule `settled` follows for
    // a response that outlived its request.
    case "confirmed":
      return state.status === "signed-in" && state.stale
        ? { status: "signed-in", user: event.user, stale: false }
        : state;

    // Replaces the person in place and leaves `stale` exactly as it found it,
    // which is the one thing that separates this from `confirmed`: a write does
    // not verify a session, so it may not promote a Stale one to confirmed. In
    // practice it never arrives against a Stale session, because these screens
    // reach the API to get their answer and a Stale session is one that could
    // not. Ignored anywhere but signed-in, so a write that landed after a
    // sign-out or an expiry cannot sign anybody back in, which is the rule every
    // event carrying a user follows here.
    case "account-updated":
      return state.status === "signed-in" ? { ...state, user: event.user } : state;
  }
}
