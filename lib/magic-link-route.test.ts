import { EXPIRED_NOTICE, OFFLINE_NOTICE, type AuthState } from "@/lib/auth-machine";
import { LINK_REFUSED_NOTICE } from "@/lib/auth-response";
import { ROLE_HREF } from "@/lib/hub-routes";
import { ONBOARDING_HREF } from "@/lib/onboarding-gate";
import {
  magicLinkRequestNotice,
  magicLinkStage,
  MISSING_TOKEN_NOTICE,
  readLinkToken,
  readyToVerify,
} from "@/lib/magic-link-route";
import type { SessionUser } from "@/lib/types";

const CUSTOMER: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "First Timer",
  email: "first-timer@talo.test",
  role: "customer",
};

const TOKEN = "3f9a2c";

const HYDRATING: AuthState = { status: "hydrating" };
const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };
const SUBMITTING: AuthState = { status: "submitting" };
const UNREACHABLE: AuthState = { status: "unreachable" };

describe("reading the token off the link", () => {
  test("a link carries its token", () => {
    expect(readLinkToken(TOKEN)).toBe(TOKEN);
  });

  test("a wrapped link can arrive with whitespace on the end", () => {
    expect(readLinkToken(` ${TOKEN}\n`)).toBe(TOKEN);
  });

  test("a repeated parameter is read as the one the link carried", () => {
    expect(readLinkToken([TOKEN, "appended"])).toBe(TOKEN);
  });

  const nothing: [string, string | string[] | undefined][] = [
    ["a link with no token at all", undefined],
    ["an empty token", ""],
    ["a token that is only whitespace", "   "],
    ["an empty repeated parameter", []],
  ];

  test.each(nothing)("%s reads as nothing to check", (_label, raw) => {
    expect(readLinkToken(raw)).toBeNull();
  });
});

describe("starting the check", () => {
  test("a token is checked once the machine can take a submit", () => {
    expect(readyToVerify(TOKEN, SIGNED_OUT, false)).toBe(true);
  });

  test("nothing is checked twice — a settled refusal lands back in signed-out", () => {
    expect(readyToVerify(TOKEN, SIGNED_OUT, true)).toBe(false);
  });

  test("nothing is sent for a link with no token", () => {
    expect(readyToVerify(null, SIGNED_OUT, false)).toBe(false);
  });

  const tooEarly: [string, AuthState][] = [
    ["hydration has not finished", HYDRATING],
    ["a check is already in flight", SUBMITTING],
    ["there is already a session", { status: "signed-in", user: CUSTOMER, stale: false }],
    ["the API could not be reached", UNREACHABLE],
  ];

  test.each(tooEarly)("no submit is attempted while %s", (_label, state) => {
    // The machine ignores a `submit` from any of these, so asking would drop the
    // attempt and leave the screen verifying with nothing on the way.
    expect(readyToVerify(TOKEN, state, false)).toBe(false);
  });
});

describe("what the route shows", () => {
  test("a link with no token is refused before anything is sent", () => {
    expect(magicLinkStage(null, SIGNED_OUT, false)).toEqual({
      kind: "refused",
      message: MISSING_TOKEN_NOTICE,
    });
  });

  test("a link with no token is refused whatever the auth state is doing", () => {
    for (const state of [HYDRATING, SIGNED_OUT, SUBMITTING, UNREACHABLE]) {
      expect(magicLinkStage(null, state, false).kind).toBe("refused");
    }
  });

  test("waiting for hydration looks the same as checking, because it is the same wait", () => {
    expect(magicLinkStage(TOKEN, HYDRATING, false)).toEqual({ kind: "verifying" });
  });

  test("a check in flight is a check in flight", () => {
    expect(magicLinkStage(TOKEN, SUBMITTING, true)).toEqual({ kind: "verifying" });
  });

  test("the moment before the effect runs is not a refusal", () => {
    expect(magicLinkStage(TOKEN, SIGNED_OUT, false)).toEqual({ kind: "verifying" });
  });

  test("a verified link lands in the Hub the server chose", () => {
    for (const role of ["customer", "agent", "admin"] as const) {
      expect(magicLinkStage(TOKEN, { status: "signed-in", user: { ...CUSTOMER, role }, stale: false }, true)).toEqual(
        { kind: "navigate", href: ROLE_HREF[role] },
      );
    }
  });

  test("a first-time email reaches the Customer Hub like any other Customer", () => {
    expect(magicLinkStage(TOKEN, { status: "signed-in", user: CUSTOMER, stale: false }, true)).toEqual({
      kind: "navigate",
      href: ROLE_HREF.customer,
    });
  });

  test("a link tapped by someone who already has a session lands in their Hub", () => {
    // Not verified: spending the token would mean ending a live session first,
    // and a tampered link would then have cost them one.
    expect(magicLinkStage(TOKEN, { status: "signed-in", user: CUSTOMER, stale: false }, false)).toEqual({
      kind: "navigate",
      href: ROLE_HREF.customer,
    });
  });

  test("an expired or already-used link explains itself in the server's words", () => {
    const said = "This magic link is invalid, expired, or has already been used.";
    expect(magicLinkStage(TOKEN, { status: "signed-out", notice: said }, true)).toEqual({
      kind: "refused",
      message: said,
    });
  });

  test("a refusal the server did not explain still explains itself", () => {
    expect(magicLinkStage(TOKEN, SIGNED_OUT, true)).toEqual({
      kind: "refused",
      message: LINK_REFUSED_NOTICE,
    });
  });

  test("a session that expired while the link was open says so", () => {
    expect(
      magicLinkStage(TOKEN, { status: "signed-out", notice: EXPIRED_NOTICE }, true),
    ).toEqual({ kind: "refused", message: EXPIRED_NOTICE });
  });

  test("an unreachable API is not a bad link, and is not a spinner either", () => {
    expect(magicLinkStage(TOKEN, UNREACHABLE, true)).toEqual({
      kind: "refused",
      message: OFFLINE_NOTICE,
    });
  });

  test("every state answers — no path leaves the screen with nothing to show", () => {
    const every: AuthState[] = [
      HYDRATING,
      SIGNED_OUT,
      { status: "signed-out", notice: "something was said" },
      SUBMITTING,
      { status: "signed-in", user: CUSTOMER, stale: false },
      UNREACHABLE,
    ];
    for (const state of every) {
      for (const attempted of [false, true]) {
        expect(["verifying", "navigate", "refused"]).toContain(
          magicLinkStage(TOKEN, state, attempted).kind,
        );
      }
    }
  });
});

describe("what a link request has to say for itself", () => {
  test("a send has nothing to apologise for", () => {
    expect(magicLinkRequestNotice({ kind: "sent" })).toBeNull();
  });

  test("a refusal is repeated as the server put it", () => {
    const message = "Too many login attempts. Please try again later.";
    expect(magicLinkRequestNotice({ kind: "refused", message })).toBe(message);
  });

  test("a dead network gets the sentence the rest of the app already uses for it", () => {
    expect(magicLinkRequestNotice({ kind: "transport-failure" })).toBe(OFFLINE_NOTICE);
  });
});

/**
 * A link is this client's sign-up, so this is the path most likely to resolve a
 * session for an account that has no name: the API creates the user inside
 * `/magic-link/verify`, with whatever name the request carried — and since the
 * sign-in screen stopped asking for one, that is nothing.
 */
describe("a verified link for an account with no name", () => {
  const nameless: AuthState = {
    status: "signed-in",
    user: { ...CUSTOMER, name: "" },
    stale: false,
  };

  test("lands on onboarding rather than the Hub", () => {
    expect(magicLinkStage(TOKEN, nameless, true)).toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });

  test("and does so before the token is settled, like any other signed-in link", () => {
    // Someone already signed in who taps a link is not verifying anything; the
    // gate applies to them for the same reason the Hub did.
    expect(magicLinkStage(TOKEN, nameless, false)).toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });

  test("an account with a name still goes to its Hub", () => {
    expect(
      magicLinkStage(TOKEN, { status: "signed-in", user: CUSTOMER, stale: false }, true),
    ).toEqual({ kind: "navigate", href: ROLE_HREF[CUSTOMER.role] });
  });
});
