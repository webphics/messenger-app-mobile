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
 * Whether the server has a name for this person.
 *
 * Two tests rather than one, and the second is the load-bearing half.
 * `parseSessionUser` does not hand on a blank name: it substitutes the address
 * (`nonEmptyString(record.name) ?? email`) so every display site has something
 * to draw. That substitution is deliberate and stays — the Hub greeting reads
 * this field — but it means a blank name never survives the parse, so a gate
 * testing only for blank can never fire. It did not: an account the API had
 * just created with `name: ''` walked straight into the Hub, greeted by its own
 * address.
 *
 * So this is the inverse of that substitution rather than a guess about it. The
 * one person it catches who does have a name is somebody whose name *is* their
 * address, and asking them for a better one is the right outcome anyway.
 *
 * The lesson is in `onboarding-gate.test.ts`: the tests that passed while this
 * was broken built a `SessionUser` by hand. The ones that matter go through the
 * parser, because that is where the substitution lives.
 */
export function needsOnboarding(user: SessionUser): boolean {
  const name = user.name?.trim();
  if (!name) return true;

  return name.toLowerCase() === user.email.trim().toLowerCase();
}

export const TERMS_HREF = "/(auth)/terms" as Href;

/**
 * Whether this person still has to agree to the Terms of Use (App Store
 * guideline 1.2): the API says they never have. Only an explicit null — an
 * absent field is a person kept from an older build, whose answer arrives with
 * the next reachable session read.
 *
 * Every way in reaches it the way onboarding is reached, because a Google
 * account's first sign-in and a sign-up link opened from an unknown address
 * both create the account without the sign-up form's checkbox.
 */
export function needsTerms(user: SessionUser): boolean {
  return user.termsAcceptedAt === null;
}

/**
 * The gate a signed-in person is owed before their Hub, or null for none:
 * the terms first, because nothing — not even choosing a name — happens on
 * ChatRoute before somebody has agreed to how it is used, then onboarding.
 */
export function gateDestination(user: SessionUser): Href | null {
  if (needsTerms(user)) return TERMS_HREF;
  if (needsOnboarding(user)) return ONBOARDING_HREF;
  return null;
}

/**
 * The destination for a signed-in person: the terms while they have not agreed
 * to them, onboarding while the name is blank, their role's Hub once neither
 * holds.
 *
 * Every place that navigates on a resolved session goes through this rather
 * than reading `ROLE_HREF` directly, so the gate cannot be true on one route in
 * and false on another.
 */
export function signedInDestination(user: SessionUser): Href {
  return gateDestination(user) ?? ROLE_HREF[user.role];
}
