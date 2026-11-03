import { OFFLINE_NOTICE, type AuthState } from "@/lib/auth-machine";
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
  hasPassword: false,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
  username: null,
  phone: null,
  image: null,
};

const TOKEN = "3f9a2c";

const HYDRATING: AuthState = { status: "hydrating" };
const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };
const SUBMITTING: AuthState = { status: "submitting" };
const UNREACHABLE: AuthState = { status: "unreachable" };
const SIGNED_IN: AuthState = { status: "signed-in", user: CUSTOMER, stale: false };

describe("reading the token off the link", () => {
  test("a wrapped link can arrive with whitespace, and a repeated parameter reads as the first", () => {
    expect(readLinkToken(` ${TOKEN}\n`)).toBe(TOKEN);
    expect(readLinkToken([TOKEN, "appended"])).toBe(TOKEN);
  });

  test.each([undefined, "", "   ", []])("%p reads as nothing to check", (raw) => {
    expect(readLinkToken(raw)).toBeNull();
  });
});

describe("starting the check", () => {
  test("a token is checked once, when the machine can take a submit", () => {
    expect(readyToVerify(TOKEN, SIGNED_OUT, false)).toBe(true);
    expect(readyToVerify(TOKEN, SIGNED_OUT, true)).toBe(false);
    expect(readyToVerify(null, SIGNED_OUT, false)).toBe(false);
  });

  // The machine ignores a `submit` from any of these, so asking would drop the attempt.
  test.each([HYDRATING, SUBMITTING, SIGNED_IN, UNREACHABLE])(
    "no submit is attempted from %p",
    (state) => {
      expect(readyToVerify(TOKEN, state, false)).toBe(false);
    },
  );
});

describe("what the route shows", () => {
  test("a link with no token is refused before anything is sent, whatever the auth state", () => {
    expect(magicLinkStage(null, SIGNED_OUT, false)).toEqual({
      kind: "refused",
      message: MISSING_TOKEN_NOTICE,
    });
    for (const state of [HYDRATING, SUBMITTING, UNREACHABLE]) {
      expect(magicLinkStage(null, state, false).kind).toBe("refused");
    }
  });

  test("waiting for hydration, and the moment before the effect runs, are not a refusal", () => {
    expect(magicLinkStage(TOKEN, HYDRATING, false)).toEqual({ kind: "verifying" });
    expect(magicLinkStage(TOKEN, SIGNED_OUT, false)).toEqual({ kind: "verifying" });
  });

  test("a verified link, or someone already signed in, lands in the Hub the server chose", () => {
    for (const role of ["customer", "agent", "admin"] as const) {
      const state: AuthState = { status: "signed-in", user: { ...CUSTOMER, role }, stale: false };
      expect(magicLinkStage(TOKEN, state, true)).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
    expect(magicLinkStage(TOKEN, SIGNED_IN, false)).toEqual({
      kind: "navigate",
      href: ROLE_HREF.customer,
    });
  });

  test("a refusal speaks in the server's words, or the default when it said none", () => {
    const said = "This magic link is invalid, expired, or has already been used.";
    expect(magicLinkStage(TOKEN, { status: "signed-out", notice: said }, true)).toEqual({
      kind: "refused",
      message: said,
    });
    expect(magicLinkStage(TOKEN, SIGNED_OUT, true)).toEqual({
      kind: "refused",
      message: LINK_REFUSED_NOTICE,
    });
  });

  test("an unreachable API is not a bad link, and is not a spinner either", () => {
    expect(magicLinkStage(TOKEN, UNREACHABLE, true)).toEqual({
      kind: "refused",
      message: OFFLINE_NOTICE,
    });
  });

  // A link is this client's sign-up, so a nameless account is the likeliest to arrive here.
  test("an account with no name lands on onboarding rather than the Hub", () => {
    const nameless: AuthState = {
      status: "signed-in",
      user: { ...CUSTOMER, name: "" },
      stale: false,
    };
    expect(magicLinkStage(TOKEN, nameless, true)).toEqual({
      kind: "navigate",
      href: ONBOARDING_HREF,
    });
  });
});

test("a link request repeats a refusal as the server put it, and says nothing for a send", () => {
  expect(magicLinkRequestNotice({ kind: "sent" })).toBeNull();
  expect(magicLinkRequestNotice({ kind: "refused", message: "Too many attempts." })).toBe(
    "Too many attempts.",
  );
});
