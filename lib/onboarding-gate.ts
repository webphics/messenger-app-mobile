import type { Href } from "expo-router";

import { ROLE_HREF } from "@/lib/hub-routes";
import type { SessionUser } from "@/lib/types";

/**
 * Where a signed-in person goes, which is not always their Hub.
 *
 * The web client gates this in its proxy (`needsOnboarding` in `src/proxy.ts`):
 * an authenticated account with a blank name is sent to `/onboarding` from
 * wherever it was going, and the redirect sits *before* the "already signed in,
 * go home" rule so a new account reaches it in one hop rather than bouncing off
 * a dashboard on the way.
 *
 * It is a gate rather than a step in sign-in, and that distinction is the whole
 * of this module. Onboarding is reached whatever produced the session — a
 * password, Google, a magic link, an invitation redeemed on another device —
 * because the only thing it tests is the blank name. So it cannot live in the
 * sign-in form: a cold start holding a hydrated session never goes through that
 * form and has exactly the same question to answer.
 *
 * In practice it is mostly the magic-link path, which is this client's sign-up:
 * a link creates the account with whatever name was supplied and that may be
 * nothing. Google usually supplies one, and invitation redemption takes a name
 * in its body.
 */

export const ONBOARDING_HREF = "/(auth)/onboarding" as Href;

/**
 * Written the way the web writes it, optional chaining included, because the
 * payload's `name` is typed as a string here and the API may still answer null
 * for an account created by a link that carried no name — which is the exact
 * account this gate exists for.
 */
export function needsOnboarding(user: SessionUser): boolean {
  return !user.name?.trim();
}

/**
 * The destination for a signed-in person: onboarding while the name is blank,
 * their role's Hub once it is not.
 *
 * Every place that navigates on a resolved session goes through this rather
 * than reading `ROLE_HREF` directly, so the gate cannot be true on one route in
 * and false on another.
 */
export function signedInDestination(user: SessionUser): Href {
  return needsOnboarding(user) ? ONBOARDING_HREF : ROLE_HREF[user.role];
}
