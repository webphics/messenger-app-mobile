import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { chatHref } from "@/lib/chat-route-id";
import { pushRouteHref, ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";
import type { PushRoute } from "@/lib/push-rules";
import { needsOnboarding, ONBOARDING_HREF } from "@/lib/onboarding-gate";
import type { ConversationFetch } from "@/lib/types";

/**
 * Whether the Launch screen may end yet, as a pure function of the two things
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
 * *after* it — three requests for a Customer — so leaving on Hydration alone
 * hands over a Hub that fills in
 * underneath the person a moment later.
 *
 * How long that wait may run is not decided here and deliberately not: no input
 * here is a clock, and the Launch deadline arrives as a third thing the fetch
 * can *say* rather than as a clock this module or the launch screen holds. See
 * #52, and `lib/launch-deadline` for the clock itself.
 *
 * The third input is a notification somebody tapped, and it is here for the same
 * reason the fetch is: there is one answer to where a launch lands, and a second
 * route deciding it separately would be a second answer that has to agree with
 * this one. It changes exactly one row — a signed-in person with a Hub behind
 * them opens the thread instead of the Hub. Every other row is what it was,
 * including the wait: a thread Restores from the Store and draws immediately,
 * but the Hub underneath it has to exist for Back to mean anything. See #59.
 */

export type LaunchDestination =
  /** Hydration has not settled, or the list is still coming. Keep the launch screen up. */
  | { kind: "wait" }
  | {
      kind: "navigate";
      href: Href;
      /**
       * What has to be on the stack underneath `href` before the launch lands on
       * it, or absent when `href` is the whole of it. Only a tapped notification
       * asks for this: the thread is where somebody is going and the Hub is what
       * Back has to find when they leave it.
       */
      behind?: Href;
    }
  /** A Session cookie is held but the API did not answer: a screen here, not a route. */
  | { kind: "unreachable" };

const WAIT: LaunchDestination = { kind: "wait" };
const UNREACHABLE: LaunchDestination = { kind: "unreachable" };
const TO_SIGN_IN: LaunchDestination = { kind: "navigate", href: SIGN_IN_HREF };

export function launchDestination(
  state: AuthState,
  conversationFetch: ConversationFetch,
  /**
   * The conversation a tapped notification asked for, or null — which is both
   * an ordinary launch and a dispatch `lib/push-rules` could not read. The two
   * answer alike deliberately: a malformed payload must not be able to do
   * anything to a launch, and the way to guarantee that is for it to arrive here
   * as the same value a launch nobody tapped does.
   */
  pendingThread: string | null = null,
  /**
   * The screen a tapped notification about no conversation asked for (a Post, the
   * invitations, the conversation list), or null. Opened over the Hub exactly as a tapped
   * thread is; a thread outranks it, though one tap never names both.
   */
  pendingRoute: PushRoute | null = null,
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
    case "signed-in": {
      if (conversationFetch === "outstanding") return WAIT;
      // The gate outranks both the Hub and a tapped thread. An account with no
      // name is owed onboarding before it is shown anything, and a thread
      // opened behind that screen would sit under a form the person cannot
      // leave. The combination is close to unreachable in practice — an
      // account new enough to have no name has no conversations to be notified
      // about — but the order has to be the same one every other entry point
      // uses, or the gate is true on one route in and false on another.
      if (needsOnboarding(state.user)) {
        return { kind: "navigate", href: ONBOARDING_HREF };
      }

      const hub = ROLE_HREF[state.user.role];
      if (pendingThread) {
        return { kind: "navigate", href: chatHref(pendingThread), behind: hub };
      }
      return pendingRoute
        ? { kind: "navigate", href: pushRouteHref(pendingRoute, state.user.role), behind: hub }
        : { kind: "navigate", href: hub };
    }
    // A Session cookie is held but the API did not answer, so a tapped thread is
    // worth keeping rather than dropped: the cookie is still good, the Store is
    // still there, and a retry that reaches the API comes back round to the
    // signed-in row above with the same thread pending.
    case "unreachable":
      return UNREACHABLE;
    // No session, so no list was ever asked for: whatever the fetch says, it is
    // not about this person. A tapped thread is dropped here rather than held —
    // the Session end that took the cookie took the Store the thread would have
    // drawn from, so there is nothing to open.
    case "signed-out":
      return TO_SIGN_IN;
    // Not reachable from a cold start — a submit only ever comes from the
    // sign-in screen — but that is also the answer if it ever were.
    case "submitting":
    // Nor is this: hydration issues no challenge, and a challenge is raised by
    // the sign-in screen, which is where it is answered. The same destination
    // for the same reason.
    case "two-factor":
      return TO_SIGN_IN;
  }
}
