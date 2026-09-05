import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import type { ConversationFetch } from "@/lib/types";

/**
 * Whether the Launch animation may end yet, as a pure function of the three
 * things that decide it: where Hydration landed, what the first Conversation
 * fetch has done, and how long all of that has been allowed to take.
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
 * The hold is the third because waiting on the fetch is only safe if the fetch
 * is guaranteed to settle, and it is not. `lib/api-client`'s Request deadline
 * bounds one round trip; a socket that flaps inside the launch window abandons
 * the load in flight and starts another, each with a deadline of its own, so
 * the sum of them has no bound at all. See #52. The bound is the answer, and it
 * is an input here rather than a timer that navigates on its own: reaching it
 * is another thing the same decision weighs, not a second decision racing it.
 * How long it is belongs to the screen holding the clock; what it means is
 * here.
 */

/**
 * How long the hold has run: still inside the bound, or past it.
 *
 * Measured over the launch as a whole rather than over any one request, which
 * is the entire distinction — see the module comment.
 */
export type LaunchHold = "within" | "expired";

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
  hold: LaunchHold,
): LaunchDestination {
  switch (state.status) {
    // One request with one deadline and no resync to restart it, so the bound
    // has nothing to rescue here — and nowhere to send anyone if it did, since
    // which Hub is exactly what Hydration was going to say.
    case "hydrating":
      return WAIT;
    // The role is the server's, read off the session — never anything this
    // client picked or remembered.
    //
    // The one status the fetch has a say in, because it is the only one with a
    // Hub behind it to arrive empty.
    //
    // And the only one the bound can release, because it is the only one with
    // somewhere to go: past the bound an outstanding fetch is handed over to
    // the Hub, which draws the Restored rows and takes the list whenever it
    // does arrive.
    case "signed-in":
      return conversationFetch === "outstanding" && hold === "within"
        ? WAIT
        : { kind: "navigate", href: ROLE_HREF[state.user.role] };
    // Not something the bound touches: there is no session behind it, so no Hub
    // to hand over to and nothing the wait could be shortened towards. The
    // retry button is the end of this launch.
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
