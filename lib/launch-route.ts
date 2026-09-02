import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { ROLE_HREF, SIGN_IN_HREF } from "@/lib/hub-routes";

/**
 * Where a cold start sends you, as a pure function of auth state.
 *
 * Kept out of the launch screen because the decision worth being sure about is
 * the mapping, not the timers and refs around it. Hydration's third outcome is
 * the reason: Unreachable is *not* a route, and folding it in with signed-out —
 * the easy mistake, since both mean "no user to show" — is the wrongful sign-out
 * `lib/auth-service` keeps the cookie to avoid. As a table, that is one row
 * rather than a state you reproduce by unplugging a laptop.
 */

export type LaunchDestination =
  /** Hydration has not settled. Keep the launch animation up. */
  | { kind: "wait" }
  | { kind: "navigate"; href: Href }
  /** A Session cookie is held but the API did not answer: a screen here, not a route. */
  | { kind: "unreachable" };

const WAIT: LaunchDestination = { kind: "wait" };
const UNREACHABLE: LaunchDestination = { kind: "unreachable" };
const TO_SIGN_IN: LaunchDestination = { kind: "navigate", href: SIGN_IN_HREF };

export function launchDestination(state: AuthState): LaunchDestination {
  switch (state.status) {
    case "hydrating":
      return WAIT;
    // The role is the server's, read off the session — never anything this
    // client picked or remembered.
    case "signed-in":
      return { kind: "navigate", href: ROLE_HREF[state.user.role] };
    case "unreachable":
      return UNREACHABLE;
    case "signed-out":
      return TO_SIGN_IN;
    // Not reachable from a cold start — a submit only ever comes from the
    // sign-in screen — but that is also the answer if it ever were.
    case "submitting":
      return TO_SIGN_IN;
  }
}
