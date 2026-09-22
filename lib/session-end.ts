import type { Href } from "expo-router";

import type { AuthState } from "@/lib/auth-machine";
import { SIGN_IN_HREF } from "@/lib/hub-routes";

/**
 * Where the end of a session sends you, as a pure function of the change in auth
 * state.
 *
 * A session ends two ways — a deliberate sign-out, and a Session cookie the API
 * stopped accepting — and they have to land in the same place. Each screen
 * navigating for itself gets the first right and cannot get the second at all:
 * an expiry has no button behind it, and so no screen to navigate from.
 *
 * It reads the change rather than the state because "signed out" alone is not the
 * question. A cold start begins signed out, and routing on that would cut the
 * launch animation short and take the decision away from `lib/launch-route`. A
 * refused sign-in ends signed out too, and replacing the route someone is
 * standing on would throw away what they typed.
 */

type Status = AuthState["status"];

/** The change to read: the status held before, and the one arrived at. */
export type SessionChange = { from: Status; to: Status };

export function sessionEndHref({ from, to }: SessionChange): Href | null {
  if (to !== "signed-out") return null;

  // Exhaustive rather than a membership test, so a sixth status has to answer
  // this question rather than defaulting to staying put.
  switch (from) {
    // The two statuses that hold a session, and so the two you can be put out of.
    case "signed-in":
    case "unreachable":
      return SIGN_IN_HREF;
    // A cold start: `lib/launch-route` owns this, behind the launch animation.
    case "hydrating":
    // A refused sign-in, on the screen it was typed into.
    case "submitting":
    // A challenge cancelled or lapsed, on the same screen: the code entry is a
    // state of the sign-in screen rather than a route, so backing out of it
    // leaves somebody exactly where they already are.
    case "two-factor":
    // Already there.
    case "signed-out":
      return null;
  }
}
