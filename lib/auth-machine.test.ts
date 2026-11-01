import {
  authTransition,
  EXPIRED_NOTICE,
  OFFLINE_NOTICE,
  UNREADABLE_NOTICE,
  type AuthState,
} from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import { CHALLENGE_LAPSED_NOTICE } from "@/lib/two-factor-challenge";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  hasPassword: true,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
};

const CUSTOMER: SessionUser = { ...AGENT, role: "customer" };

const SESSION_COOKIE = "better-auth.session_token=abc.def";

const CHALLENGE_COOKIE = "better-auth.two_factor=chal.lenge";

const SIGNED_IN: AuthOutcome = { kind: "signed-in", cookie: SESSION_COOKIE, user: AGENT };
const TWO_FACTOR: AuthOutcome = { kind: "two-factor", challenge: CHALLENGE_COOKIE };
const REFUSED: AuthOutcome = {
  kind: "unauthorised",
  message: "Invalid email or password.",
};
const OFFLINE: AuthOutcome = { kind: "transport-failure" };

const HYDRATING: AuthState = { status: "hydrating" };
const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };
const SUBMITTING: AuthState = { status: "submitting" };
const UNREACHABLE: AuthState = { status: "unreachable" };
const AUTHENTICATED: AuthState = { status: "signed-in", user: AGENT, stale: false };
/** The same person, on a device that has not been able to ask about them. */
const STALE: AuthState = { status: "signed-in", user: AGENT, stale: true };
/** The challenge, waiting for a code with nothing to say about the last one. */
const CHALLENGED: AuthState = {
  status: "two-factor",
  challenge: CHALLENGE_COOKIE,
  verifying: false,
  notice: null,
};
/** The same challenge with a code out. */
const VERIFYING: AuthState = { ...CHALLENGED, verifying: true };

const EVERY_STATE: AuthState[] = [
  HYDRATING,
  SIGNED_OUT,
  { status: "signed-out", notice: "something was said" },
  SUBMITTING,
  AUTHENTICATED,
  STALE,
  UNREACHABLE,
  CHALLENGED,
  VERIFYING,
];

describe("hydration, with nobody kept on the device", () => {
  const cases: [string, AuthOutcome | null, AuthState][] = [
    ["no stored cookie signs nobody in", null, SIGNED_OUT],
    ["a live cookie signs its owner in", SIGNED_IN, AUTHENTICATED],
    ["a cookie the server rejected is dropped without an accusation", REFUSED, SIGNED_OUT],
    ["a cookie the server never answered for is Unreachable, not signed out", OFFLINE, UNREACHABLE],
  ];

  test.each(cases)("%s", (_label, outcome, expected) => {
    expect(authTransition(HYDRATING, { type: "hydrated", outcome, kept: null })).toEqual(expected);
  });

  test("a hydration result that arrives after hydrating ended is ignored", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "hydrating")) {
      expect(
        authTransition(state, { type: "hydrated", outcome: SIGNED_IN, kept: null }),
      ).toEqual(state);
    }
  });
});

/**
 * The Kept person, and the one question it answers: may this device draw what it
 * already holds while nobody can confirm who holds it?
 *
 * Only the three outcomes that say nothing about the cookie change — every other
 * row here is the same answer as the table above, which is the point. A person
 * kept on the device is not a credential: it decides nothing when the API
 * answered, and nothing at all when there was no cookie to check.
 */
describe("hydration, with a person kept on the device", () => {
  const cases: [string, AuthOutcome | null, AuthState][] = [
    ["no stored cookie is still nobody signed in — a name is not a credential", null, SIGNED_OUT],
    ["a cookie the server rejected is gone, kept person and all", REFUSED, SIGNED_OUT],
    ["a dead network resolves Stale rather than Unreachable", OFFLINE, STALE],
  ];

  test.each(cases)("%s", (_label, outcome, expected) => {
    expect(authTransition(HYDRATING, { type: "hydrated", outcome, kept: AGENT })).toEqual(
      expected,
    );
  });
});

/**
 * The account screens' write, landing back on the person it changed.
 *
 * Distinct from confirming a Stale session below, and the two tests that matter
 * are the two differences: it applies to a session nobody doubted, and it leaves
 * `stale` alone rather than promoting anything.
 */
describe("an account screen writing to the signed-in person", () => {
  const WITH_PASSWORD: SessionUser = { ...AGENT, hasPassword: true };
  const WITHOUT = { ...AGENT, hasPassword: false, twoFactorEnabled: false };

  test("a write does not verify a session, so a Stale one stays Stale", () => {
    const before: AuthState = { status: "signed-in", user: WITHOUT, stale: true };

    expect(
      authTransition(before, { type: "account-updated", user: WITH_PASSWORD }),
    ).toEqual({ status: "signed-in", user: WITH_PASSWORD, stale: true });
  });

  test("does nothing anywhere but signed-in", () => {
    // A write that landed after a sign-out or an expiry must not sign anybody
    // back in, the same rule every other event carrying a user follows.
    for (const state of EVERY_STATE.filter((s) => s.status !== "signed-in")) {
      expect(authTransition(state, { type: "account-updated", user: CUSTOMER })).toBe(
        state,
      );
    }
  });
});

describe("the server refusing a request with terms_required", () => {
  const AGREED: SessionUser = { ...AGENT, termsAcceptedAt: "2026-10-31T10:00:00.000Z" };
  const { termsAcceptedAt: _unknown, ...KEPT_BY_OLDER_BUILD } = AGREED;

  test.each([
    ["a person this device thought had agreed", AGREED],
    ["a person kept by an older build, with no answer either way", KEPT_BY_OLDER_BUILD],
  ])("marks %s as owing the terms, in place", (_label, user) => {
    const before: AuthState = { status: "signed-in", user, stale: false };
    expect(authTransition(before, { type: "terms-required" })).toEqual({
      status: "signed-in",
      user: { ...user, termsAcceptedAt: null },
      stale: false,
    });
  });

  test("a person already owing them is the same state, so a burst re-renders nothing", () => {
    const before: AuthState = {
      status: "signed-in",
      user: { ...AGENT, termsAcceptedAt: null },
      stale: true,
    };
    expect(authTransition(before, { type: "terms-required" })).toBe(before);
  });

  test("does nothing anywhere but signed-in", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "signed-in")) {
      expect(authTransition(state, { type: "terms-required" })).toBe(state);
    }
  });
});

describe("confirming a Stale session", () => {
  test("replaces the kept person with the one the API named, in place", () => {
    expect(authTransition(STALE, { type: "confirmed", user: CUSTOMER })).toEqual({
      status: "signed-in",
      user: CUSTOMER,
      stale: false,
    });
  });

  test("does nothing anywhere else, including a session already confirmed", () => {
    // Signing out or expiring while the confirmation was in flight is the case
    // that matters: it must not sign anybody back in, the same rule a settled
    // sign-in attempt follows.
    for (const state of EVERY_STATE.filter((s) => s !== STALE)) {
      expect(authTransition(state, { type: "confirmed", user: CUSTOMER })).toBe(state);
    }
  });
});

/**
 * A session re-read because something the API answered said this device's copy
 * of the person was out of date — assignment switched off under it. The flag is
 * the field that moves, so the rows are about the flag.
 */
describe("re-reading a session already in use", () => {
  const ASSIGNING: SessionUser = { ...AGENT, supportAssignmentEnabled: true };
  const SHARED: SessionUser = { ...AGENT, supportAssignmentEnabled: false };

  test.each([
    ["Stale, which the answer confirms", { status: "signed-in", user: ASSIGNING, stale: true }, SHARED],
  ] as const)("replaces the person on a %s session", (_label, before, user) => {
    expect(authTransition(before, { type: "reconfirmed", user })).toEqual({
      status: "signed-in",
      user,
      stale: false,
    });
  });

  test("does nothing anywhere but signed-in", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "signed-in")) {
      expect(authTransition(state, { type: "reconfirmed", user: SHARED })).toBe(state);
    }
  });
});

describe("submitting", () => {
  test("a submit clears the previous notice", () => {
    const withNotice: AuthState = { status: "signed-out", notice: "Invalid email or password." };
    expect(authTransition(withNotice, { type: "submit" })).toEqual(SUBMITTING);
  });

  test("submit does nothing from any state that is not the sign-in screen", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "signed-out")) {
      expect(authTransition(state, { type: "submit" })).toBe(state);
    }
  });
});

describe("a settled sign-in attempt", () => {
  const cases: [string, AuthOutcome, AuthState][] = [
    ["correct credentials sign the person in as the role the server gave", SIGNED_IN, AUTHENTICATED],
    ["wrong credentials say what the server said", REFUSED, { status: "signed-out", notice: "Invalid email or password." }],
    ["a correct credential on a two-factor account asks for a code, carrying the challenge", TWO_FACTOR, CHALLENGED],
    ["a dead network says so", OFFLINE, { status: "signed-out", notice: OFFLINE_NOTICE }],
  ];

  test.each(cases)("%s", (_label, outcome, expected) => {
    expect(authTransition(SUBMITTING, { type: "settled", outcome })).toEqual(expected);
  });

  test("a response that outlived its request cannot sign anyone back in", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "submitting")) {
      expect(authTransition(state, { type: "settled", outcome: SIGNED_IN })).toBe(state);
    }
  });
});

/**
 * The five transitions ADR-0013 names, at the seam it names them at: entering
 * the challenge, refusing a wrong code, expiring, cancelling, and completing.
 *
 * All five are here rather than in a component test because all five are facts
 * about the machine, and because the two that matter most are invisible in a
 * rendered screen and obvious in a table. Those two are a refusal that must not
 * end the handshake, and a lapse that has no signal to read.
 */
describe("the two-factor challenge", () => {
  describe("submitting a code", () => {
    test("puts a code in flight and clears whatever the last one was told", () => {
      const refused: AuthState = { ...CHALLENGED, notice: "That code was not accepted." };
      expect(authTransition(refused, { type: "submit-code" })).toEqual(VERIFYING);
    });

    test("does nothing from any state that is not a challenge waiting for a code", () => {
      for (const state of EVERY_STATE.filter((s) => s !== CHALLENGED)) {
        expect(authTransition(state, { type: "submit-code" })).toBe(state);
      }
    });
  });

  describe("a settled code", () => {
    const cases: [string, AuthOutcome, AuthState][] = [
      ["the right code completes the sign-in as the role the server gave", SIGNED_IN, AUTHENTICATED],
      ["a wrong code says so and leaves the challenge standing", { kind: "unauthorised", message: "That code was not accepted." }, { ...CHALLENGED, notice: "That code was not accepted." }],
      ["a verify that answered with another challenge is unreadable, not a second handshake", TWO_FACTOR, { ...CHALLENGED, notice: UNREADABLE_NOTICE }],
    ];

    test.each(cases)("%s", (_label, outcome, expected) => {
      expect(authTransition(VERIFYING, { type: "code-settled", outcome })).toEqual(expected);
    });

    test("an answer that outlived its request cannot sign anyone in", () => {
      for (const state of EVERY_STATE.filter((s) => s !== VERIFYING)) {
        expect(authTransition(state, { type: "code-settled", outcome: SIGNED_IN })).toBe(state);
      }
    });
  });

  describe("cancelling", () => {
    test("works with a code still in flight, whose answer can then sign nobody in", () => {
      const cancelled = authTransition(VERIFYING, { type: "cancel-challenge" });
      expect(cancelled).toEqual(SIGNED_OUT);
      expect(
        authTransition(cancelled, { type: "code-settled", outcome: SIGNED_IN }),
      ).toBe(cancelled);
    });

    test("does nothing anywhere else", () => {
      for (const state of EVERY_STATE.filter((s) => s.status !== "two-factor")) {
        expect(authTransition(state, { type: "cancel-challenge" })).toBe(state);
      }
    });
  });

  describe("lapsing", () => {
    /**
     * Unlike every other notice in this module, this one cannot come from the
     * server: better-auth answers a lapsed challenge and a wrong code with the
     * same 401, so the only thing that can say "sign in again" is the clock in
     * `lib/two-factor-challenge`.
     */
    test("lands signed-out and says to sign in again", () => {
      expect(authTransition(CHALLENGED, { type: "challenge-lapsed" })).toEqual({
        status: "signed-out",
        notice: CHALLENGE_LAPSED_NOTICE,
      });
    });

    test("lapses with a code in flight too, and that answer signs nobody in", () => {
      const lapsed = authTransition(VERIFYING, { type: "challenge-lapsed" });
      expect(lapsed).toEqual({ status: "signed-out", notice: CHALLENGE_LAPSED_NOTICE });
      expect(authTransition(lapsed, { type: "code-settled", outcome: SIGNED_IN })).toBe(lapsed);
    });
  });
});

describe("signing out", () => {
  test("wins from every state, including mid-request", () => {
    for (const state of EVERY_STATE) {
      expect(authTransition(state, { type: "sign-out" })).toEqual(SIGNED_OUT);
    }
  });
});

describe("a session that expired mid-use", () => {
  test("wins from every state, because the credential is already gone by then", () => {
    // `lib/auth-service` discards the cookie before reporting, so any state left
    // claiming a session would be claiming one that no longer exists — and a
    // hydration or sign-in still in flight would otherwise land afterwards and
    // sign someone in with nothing in the keychain behind it.
    for (const state of EVERY_STATE) {
      expect(authTransition(state, { type: "expired" })).toEqual({
        status: "signed-out",
        notice: EXPIRED_NOTICE,
      });
    }
  });
});

describe("retry", () => {
  test("an Unreachable start can be tried again", () => {
    expect(authTransition(UNREACHABLE, { type: "retry" })).toEqual(HYDRATING);
  });
});
