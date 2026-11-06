import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { OFFLINE_NOTICE } from "@/lib/auth-machine";
import {
  LINK_REFUSED_NOTICE,
  type MagicLinkRequestOutcome,
} from "@/lib/auth-response";
import { SIGN_IN_HREF } from "@/lib/hub-routes";
import { signedInDestination } from "@/lib/onboarding-gate";

/**
 * What the verification route shows, as a pure function of the token it was
 * opened with and the auth state around it.
 *
 * The same reason `lib/launch-route` exists: the screen owns an effect and a
 * flag, and neither is the part worth being sure about. What is worth being sure
 * about is that a link with no token, a link the server refused, a link tapped
 * while the API is unreachable and a link tapped by someone already signed in
 * are four different answers — and that none of them is a spinner that never
 * stops. As a table that is four rows rather than four builds.
 */

export type MagicLinkStage =
  /** The token is being checked, or hydration has not finished making room to check it. */
  | { kind: "verifying" }
  /**
   * A link this device did not just ask for. Nothing is spent until the person
   * holding the phone says so, because a link can be somebody else's account.
   */
  | { kind: "confirm" }
  | { kind: "navigate"; href: Href }
  /** The link cannot sign anyone in. The screen owes an explanation and a way back. */
  | { kind: "refused"; message: string };

/**
 * A link that arrived without its token. Not a server refusal — nothing was ever
 * sent — so it is worded as the link being wrong rather than the person being.
 */
export const MISSING_TOKEN_NOTICE =
  "This sign-in link is incomplete. Request a new one from the sign-in screen.";

/**
 * The token this route was opened with, or null when there is nothing to check.
 *
 * A repeated query parameter arrives as an array; the first is the one the link
 * carried, and the rest are somebody's appended second copy. Trimmed because a
 * mail client that wraps a long link can leave whitespace on the end of it.
 */
export function readLinkToken(raw: string | string[] | undefined): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof first === "string" ? first.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * How long after a request on this device a link is taken to be that request's
 * answer, and opened without asking.
 *
 * The link's own lifetime (`expiresIn: 60 * 15` on the API's `magicLink`
 * plugin): any link this device asked for is dead after it, so a longer window
 * would only widen the case it exists to close.
 */
export const MAGIC_LINK_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/**
 * Whether a link must be confirmed before its token is spent.
 *
 * Spending a token signs this phone in to whichever account the link was made
 * for, and the link does not say which. Somebody can mail a person a link for
 * their own account, and a phone that opened it unasked would land in it (a
 * login CSRF). So a link is confirmed unless this device asked for one within
 * the window: `requestedAt` is that record, null when there is none.
 *
 * A record from the future is a clock that moved, not a recent request, and
 * reads as no record. The cost of being wrong in that direction is one tap.
 */
export function linkNeedsConfirmation(requestedAt: number | null, now: number): boolean {
  if (requestedAt === null || !Number.isFinite(requestedAt)) return true;
  const age = now - requestedAt;
  return age < 0 || age > MAGIC_LINK_REQUEST_WINDOW_MS;
}

/**
 * The stored request record, read back. Anything but a plain non-negative
 * integer is no record, which `linkNeedsConfirmation` turns into a question.
 */
export function readRequestRecord(text: string | null): number | null {
  const trimmed = text?.trim() ?? "";
  if (!/^\d{1,15}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Whether the verification call should be started now.
 *
 * Only from `signed-out`, because that is the only state the auth machine will
 * accept a `submit` from — asking earlier would drop the attempt on the floor and
 * leave the screen verifying forever. `started` is what stops a settled refusal,
 * which lands back in `signed-out`, from spending a second link. `confirmed` is
 * the person's yes, or this device's own recent request standing in for it.
 */
export function readyToVerify(
  token: string | null,
  state: AuthState,
  started: boolean,
  confirmed: boolean,
): boolean {
  return token !== null && !started && confirmed && state.status === "signed-out";
}

/**
 * `settled` is whether a verification has already come back — not whether one has
 * been sent. A refusal returns to `signed-out`, the state it started from, so
 * this is the only thing that separates "refused" from "about to ask".
 */
export function magicLinkStage(
  token: string | null,
  state: AuthState,
  settled: boolean,
  confirmed: boolean,
): MagicLinkStage {
  if (token === null) return { kind: "refused", message: MISSING_TOKEN_NOTICE };

  switch (state.status) {
    // Covers both the link that just worked and the link tapped by someone who
    // already had a session. The second lands in the Hub without the token ever
    // being spent, which is the safe way round: verifying would mean ending a
    // live session first, and a tampered link would then have cost them one.
    case "signed-in":
      // Through the gate rather than straight to the Hub, and this is the path
      // that needs it most: a link is this client's sign-up, and an account a
      // link just made has whatever name was supplied with the request, which
      // is none. So the common first arrival here is exactly the one owed
      // onboarding.
      return { kind: "navigate", href: signedInDestination(state.user) };

    // Hydration is still deciding whether there is already a session, and the
    // machine will not take a `submit` until it has. Nothing to say about the
    // wait that is not already what "verifying" means.
    case "hydrating":
    case "submitting":
      return { kind: "verifying" };

    // A stored cookie the API could not be asked about. The token cannot be
    // checked either, and saying so beats a spinner that outlives the network.
    case "unreachable":
      return { kind: "refused", message: OFFLINE_NOTICE };

    // The link was good and the account wants a code as well: the API's
    // two-factor hook fires on this route exactly as it does on a password.
    // It goes to the sign-in screen rather than growing a code field here,
    // because the challenge is a state and that screen is the one that renders
    // it. The state travels, so nothing about the half-finished handshake is
    // carried in the navigation. See ADR-0013.
    case "two-factor":
      return { kind: "navigate", href: SIGN_IN_HREF };

    // Only signed-out asks, because it is the only state a token would be spent
    // from: someone already signed in is sent on without spending it, and a
    // wait or an unreachable API has nothing to confirm yet.
    case "signed-out":
      if (settled) return { kind: "refused", message: state.notice ?? LINK_REFUSED_NOTICE };
      return confirmed ? { kind: "verifying" } : { kind: "confirm" };
  }
}

/**
 * What to say about a link request, or null when there is nothing to apologise
 * for and the confirmation should stand instead.
 *
 * The words live here rather than in `lib/auth-response` because that module's
 * job is to say what happened, and because the sentence a dead network deserves
 * is the same one the auth machine already uses for it — worth sharing rather
 * than writing twice in slightly different words.
 */
export function magicLinkRequestNotice(
  outcome: MagicLinkRequestOutcome,
): string | null {
  switch (outcome.kind) {
    case "sent":
      return null;
    case "refused":
      return outcome.message;
    case "transport-failure":
      return OFFLINE_NOTICE;
  }
}
