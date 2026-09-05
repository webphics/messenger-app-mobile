import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import type { ConversationFetch } from "@/lib/types";

/**
 * Whether the Launch animation may end yet, as a pure function of the two things
 * that decide it: where Hydration landed, and what the first Conversation fetch
 * has done.
 *
 * Kept out of the launch screen because the decision worth being sure about is
 * the mapping, not the timers and refs around it. Hydration's third outcome is
 * the reason: Unreachable is *not* a route, and folding it in with signed-out —
 * the easy mistake, since both mean "no user to show" — is the wrongful sign-out
 * `lib/auth-service` keeps the cookie to avoid. As a table, that is one row
 * rather than a state you reproduce by unplugging a laptop.
 *
 * The fetch is the second half because Hydration is not the last thing that has
 * to happen before there is a Hub to hand over. The Conversations are fetched
 * *after* it — three requests for a Customer — and they reliably outlast the
 * animation, so leaving on Hydration alone hands over a Hub that fills in
 * underneath the person a moment later.
 *
 * How long that wait may run is not decided here and deliberately not: the two
 * inputs stay two, and the Launch deadline arrives as a third thing the fetch
 * can *say* rather than as a clock this module or the launch screen holds. See
 * #52, and `lib/launch-deadline` for the clock itself.
 */

export type LaunchDestination =
  /** Hydration has not settled, or the list is still coming. Keep the launch animation up. */
  | { kind: "wait" }
  | { kind: "navigate"; href: Href }
  /** A Session cookie is held but the API did not answer: a screen here, not a route. */
  | { kind: "unreachable" };

const WAIT: LaunchDestination = { kind: "wait" };
const UNREACHABLE: LaunchDestination = { kind: "unreachable" };
const TO_SIGN_IN: LaunchDestination = { kind: "navigate", href: SIGN_IN_HREF };

export function launchDestination(
  state: AuthState,
  conversationFetch: ConversationFetch,
): LaunchDestination {
  switch (state.status) {
    case "hydrating":
      return WAIT;
    // The role is the server's, read off the session — never anything this
    // client picked or remembered.
    //
    // The one status the fetch has a say in, because it is the only one with a
    // Hub behind it to arrive empty.
    //
    // Settled is settled, whichever way: `abandoned` reads exactly as
    // `answered` and `failed` do. The Launch deadline passing is the gate being
    // told to stop waiting, and with the Store there are Restored rows behind
    // the Hub for it to hand over — the load it gave up on lands in them if it
    // ever answers.
    case "signed-in":
      return conversationFetch === "outstanding"
        ? WAIT
        : { kind: "navigate", href: ROLE_HREF[state.user.role] };
    case "unreachable":
      return UNREACHABLE;
    // No session, so no list was ever asked for: whatever the fetch says, it is
    // not about this person.
    case "signed-out":
      return TO_SIGN_IN;
    // Not reachable from a cold start — a submit only ever comes from the
    // sign-in screen — but that is also the answer if it ever were.
    case "submitting":
      return TO_SIGN_IN;
  }
}
