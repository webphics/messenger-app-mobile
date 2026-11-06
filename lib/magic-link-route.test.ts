import { OFFLINE_NOTICE, type AuthState } from "@/lib/auth-machine";
import { LINK_REFUSED_NOTICE } from "@/lib/auth-response";
import { ROLE_HREF } from "@/lib/hub-routes";
import { ONBOARDING_HREF } from "@/lib/onboarding-gate";
import {
  magicLinkRequestNotice,
  linkNeedsConfirmation,
  MAGIC_LINK_REQUEST_WINDOW_MS,
  magicLinkStage,
  MISSING_TOKEN_NOTICE,
  readLinkToken,
  readRequestRecord,
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
    expect(readyToVerify(TOKEN, SIGNED_OUT, false, true)).toBe(true);
    expect(readyToVerify(TOKEN, SIGNED_OUT, true, true)).toBe(false);
    expect(readyToVerify(null, SIGNED_OUT, false, true)).toBe(false);
  });

  // The machine ignores a `submit` from any of these, so asking would drop the attempt.
  test.each([HYDRATING, SUBMITTING, SIGNED_IN, UNREACHABLE])(
    "no submit is attempted from %p",
    (state) => {
      expect(readyToVerify(TOKEN, state, false, true)).toBe(false);
    },
  );
});

describe("what the route shows", () => {
  test("a link with no token is refused before anything is sent, whatever the auth state", () => {
    expect(magicLinkStage(null, SIGNED_OUT, false, true)).toEqual({
      kind: "refused",
      message: MISSING_TOKEN_NOTICE,
    });
    for (const state of [HYDRATING, SUBMITTING, UNREACHABLE]) {
      expect(magicLinkStage(null, state, false, true).kind).toBe("refused");
    }
  });

  test("waiting for hydration, and the moment before the effect runs, are not a refusal", () => {
    expect(magicLinkStage(TOKEN, HYDRATING, false, true)).toEqual({ kind: "verifying" });
    expect(magicLinkStage(TOKEN, SIGNED_OUT, false, true)).toEqual({ kind: "verifying" });
  });

  test("a verified link, or someone already signed in, lands in the Hub the server chose", () => {
    for (const role of ["customer", "agent", "admin"] as const) {
      const state: AuthState = { status: "signed-in", user: { ...CUSTOMER, role }, stale: false };
      expect(magicLinkStage(TOKEN, state, true, true)).toEqual({
        kind: "navigate",
        href: ROLE_HREF[role],
      });
    }
    expect(magicLinkStage(TOKEN, SIGNED_IN, false, true)).toEqual({
      kind: "navigate",
      href: ROLE_HREF.customer,
    });
  });

  test("a refusal speaks in the server's words, or the default when it said none", () => {
    const said = "This magic link is invalid, expired, or has already been used.";
    expect(magicLinkStage(TOKEN, { status: "signed-out", notice: said }, true, true)).toEqual({
      kind: "refused",
      message: said,
    });
    expect(magicLinkStage(TOKEN, SIGNED_OUT, true, true)).toEqual({
      kind: "refused",
      message: LINK_REFUSED_NOTICE,
    });
  });

  test("an unreachable API is not a bad link, and is not a spinner either", () => {
    expect(magicLinkStage(TOKEN, UNREACHABLE, true, true)).toEqual({
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
    expect(magicLinkStage(TOKEN, nameless, true, true)).toEqual({
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

describe("a link this device did not ask for", () => {
  const NOW = 1_800_000_000_000;

  test.each([
    ["no record", null, true],
    ["a request a moment ago", NOW - 30_000, false],
    ["a request right now", NOW, false],
    ["a request at the edge of the window", NOW - MAGIC_LINK_REQUEST_WINDOW_MS, false],
    ["a request just past the window", NOW - MAGIC_LINK_REQUEST_WINDOW_MS - 1, true],
    ["a request yesterday", NOW - 24 * 60 * 60 * 1000, true],
    ["a record from the future", NOW + 60_000, true],
    ["an unreadable record", Number.NaN, true],
  ])("%s: confirm is %p", (_, requestedAt, confirm) => {
    expect(linkNeedsConfirmation(requestedAt, NOW)).toBe(confirm);
  });

  test("asks before spending, and only from signed-out", () => {
    expect(magicLinkStage(TOKEN, SIGNED_OUT, false, false)).toEqual({ kind: "confirm" });
    expect(readyToVerify(TOKEN, SIGNED_OUT, false, false)).toBe(false);
    // A refusal after a yes is still a refusal, not a second question.
    expect(magicLinkStage(TOKEN, SIGNED_OUT, true, false).kind).toBe("refused");
    // Someone already signed in is sent on without being asked or spending the token.
    expect(magicLinkStage(TOKEN, SIGNED_IN, false, false).kind).toBe("navigate");
    expect(magicLinkStage(TOKEN, HYDRATING, false, false)).toEqual({ kind: "verifying" });
    expect(magicLinkStage(TOKEN, UNREACHABLE, false, false).kind).toBe("refused");
    expect(magicLinkStage(null, SIGNED_OUT, false, false).kind).toBe("refused");
  });

  test("a yes starts the check", () => {
    expect(magicLinkStage(TOKEN, SIGNED_OUT, false, true)).toEqual({ kind: "verifying" });
    expect(readyToVerify(TOKEN, SIGNED_OUT, false, true)).toBe(true);
  });

  test.each([
    ["1800000000000", 1_800_000_000_000],
    [" 1800000000000\n", 1_800_000_000_000],
    [null, null],
    ["", null],
    ["-5", null],
    ["1.5", null],
    ["soon", null],
    ["1e12", null],
  ])("the record %p reads as %p", (text, requestedAt) => {
    expect(readRequestRecord(text)).toBe(requestedAt);
  });
});
