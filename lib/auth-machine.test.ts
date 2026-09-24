import {
  authTransition,
  EXPIRED_NOTICE,
  INITIAL_AUTH_STATE,
  OFFLINE_NOTICE,
  TWO_FACTOR_NOTICE,
  UNREADABLE_NOTICE,
  type AuthEvent,
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
const SERVER_ERROR: AuthOutcome = {
  kind: "server-error",
  message: "Service unavailable",
};
const MALFORMED: AuthOutcome = { kind: "malformed" };

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

test("a cold start begins by hydrating", () => {
  expect(INITIAL_AUTH_STATE).toEqual(HYDRATING);
});

describe("hydration, with nobody kept on the device", () => {
  const cases: [string, AuthOutcome | null, AuthState][] = [
    ["no stored cookie signs nobody in", null, SIGNED_OUT],
    ["a live cookie signs its owner in", SIGNED_IN, AUTHENTICATED],
    ["a cookie the server rejected is dropped without an accusation", REFUSED, SIGNED_OUT],
    ["a cookie the server never answered for is Unreachable, not signed out", OFFLINE, UNREACHABLE],
    ["a server error keeps the cookie — a bad deploy is not a bad credential", SERVER_ERROR, UNREACHABLE],
    ["an unreadable answer is Unreachable too — the cookie may still be good", MALFORMED, UNREACHABLE],
    ["a challenge at hydration still refuses rather than half-authenticating", TWO_FACTOR, { status: "signed-out", notice: TWO_FACTOR_NOTICE }],
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
    ["a live cookie signs in the person the API named, not the one on disk", SIGNED_IN, AUTHENTICATED],
    ["a cookie the server rejected is gone, kept person and all", REFUSED, SIGNED_OUT],
    ["a dead network resolves Stale rather than Unreachable", OFFLINE, STALE],
    ["a server error resolves Stale too — the cookie is kept either way", SERVER_ERROR, STALE],
    ["an unreadable answer resolves Stale, for the same reason", MALFORMED, STALE],
    ["a challenge still refuses — a kept person cannot answer a second factor", TWO_FACTOR, { status: "signed-out", notice: TWO_FACTOR_NOTICE }],
  ];

  test.each(cases)("%s", (_label, outcome, expected) => {
    expect(authTransition(HYDRATING, { type: "hydrated", outcome, kept: AGENT })).toEqual(
      expected,
    );
  });

  test("the Stale session is the kept person, in the role this device last heard", () => {
    expect(
      authTransition(HYDRATING, { type: "hydrated", outcome: OFFLINE, kept: CUSTOMER }),
    ).toEqual({ status: "signed-in", user: CUSTOMER, stale: true });
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

  test("replaces the person on a confirmed session, in place", () => {
    const before: AuthState = { status: "signed-in", user: WITHOUT, stale: false };

    expect(
      authTransition(before, { type: "account-updated", user: WITH_PASSWORD }),
    ).toEqual({ status: "signed-in", user: WITH_PASSWORD, stale: false });
  });

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

/**
 * `saveProfile`: onboarding writes the name, and the answer has to land on the
 * person in state as well as the snapshot and the Kept person `updateProfile`
 * writes. Otherwise the state goes on holding the address standing in for a
 * name, which is exactly what `needsOnboarding` sends back to onboarding.
 */
describe("a profile save", () => {
  const UNNAMED: SessionUser = { ...AGENT, name: AGENT.email };
  /** What `saveProfile` dispatches with the answer. */
  const PROFILE_SAVED: AuthEvent = { type: "account-updated", user: AGENT };

  test.each([
    ["confirmed", false],
    ["Stale", true],
  ] as const)("replaces the person on a %s session", (_label, stale) => {
    const before: AuthState = { status: "signed-in", user: UNNAMED, stale };

    expect(authTransition(before, PROFILE_SAVED)).toEqual({
      status: "signed-in",
      user: AGENT,
      stale,
    });
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
    ["confirmed, assignment switched off", { status: "signed-in", user: ASSIGNING, stale: false }, SHARED],
    ["confirmed, assignment switched on", { status: "signed-in", user: SHARED, stale: false }, ASSIGNING],
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
  test("a submit from the sign-in screen starts a request", () => {
    expect(authTransition(SIGNED_OUT, { type: "submit" })).toEqual(SUBMITTING);
  });

  test("a submit clears the previous notice", () => {
    const withNotice: AuthState = { status: "signed-out", notice: "Invalid email or password." };
    expect(authTransition(withNotice, { type: "submit" })).toEqual(SUBMITTING);
  });

  test("a second submit while one is in flight changes nothing", () => {
    expect(authTransition(SUBMITTING, { type: "submit" })).toBe(SUBMITTING);
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
    ["a server error says what the server said", SERVER_ERROR, { status: "signed-out", notice: "Service unavailable" }],
    ["an unreadable answer says so", MALFORMED, { status: "signed-out", notice: UNREADABLE_NOTICE }],
  ];

  test.each(cases)("%s", (_label, outcome, expected) => {
    expect(authTransition(SUBMITTING, { type: "settled", outcome })).toEqual(expected);
  });

  test("the role comes from the outcome, never from what the state held before", () => {
    const asCustomer: AuthOutcome = { kind: "signed-in", cookie: SESSION_COOKIE, user: CUSTOMER };
    expect(authTransition(SUBMITTING, { type: "settled", outcome: asCustomer })).toEqual({
      status: "signed-in",
      user: CUSTOMER,
      stale: false,
    });
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
  test("is entered carrying the challenge and nothing else", () => {
    expect(authTransition(SUBMITTING, { type: "settled", outcome: TWO_FACTOR })).toEqual({
      status: "two-factor",
      challenge: CHALLENGE_COOKIE,
      verifying: false,
      notice: null,
    });
  });

  test("is entered from a link and from Google too, because the API's hook fires on all three", () => {
    // The same event either way: `lib/auth-service` interprets all three routes
    // with the same reader, so there is one way in here and not three.
    expect(authTransition(SUBMITTING, { type: "settled", outcome: TWO_FACTOR })).toMatchObject({
      status: "two-factor",
      challenge: CHALLENGE_COOKIE,
    });
  });

  test("a correct password says nothing on the way in. There is nothing to accuse anybody of", () => {
    expect(
      authTransition(SUBMITTING, { type: "settled", outcome: TWO_FACTOR }),
    ).toMatchObject({ notice: null });
  });

  describe("submitting a code", () => {
    test("puts a code in flight and clears whatever the last one was told", () => {
      const refused: AuthState = { ...CHALLENGED, notice: "That code was not accepted." };
      expect(authTransition(refused, { type: "submit-code" })).toEqual(VERIFYING);
    });

    test("a second submit while one is in flight changes nothing", () => {
      expect(authTransition(VERIFYING, { type: "submit-code" })).toBe(VERIFYING);
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
      ["a server error says what the server said, and keeps the challenge", SERVER_ERROR, { ...CHALLENGED, notice: "Service unavailable" }],
      ["a dead network says so, and keeps the challenge", OFFLINE, { ...CHALLENGED, notice: OFFLINE_NOTICE }],
      ["an unreadable answer says so, and keeps the challenge", MALFORMED, { ...CHALLENGED, notice: UNREADABLE_NOTICE }],
      ["a verify that answered with another challenge is unreadable, not a second handshake", TWO_FACTOR, { ...CHALLENGED, notice: UNREADABLE_NOTICE }],
    ];

    test.each(cases)("%s", (_label, outcome, expected) => {
      expect(authTransition(VERIFYING, { type: "code-settled", outcome })).toEqual(expected);
    });

    /**
     * The acceptance criterion behind the whole ticket: a typo must not cost
     * somebody the handshake. The cookie carried out is the cookie carried in,
     * so the next code goes to the same half-finished sign-in.
     */
    test("a refusal keeps the same challenge, so another attempt needs no new password", () => {
      const after = authTransition(VERIFYING, {
        type: "code-settled",
        outcome: { kind: "unauthorised", message: "no" },
      });
      expect(after).toMatchObject({ status: "two-factor", challenge: CHALLENGE_COOKIE });

      const retried = authTransition(after, { type: "submit-code" });
      expect(retried).toEqual(VERIFYING);
    });

    test("an answer that outlived its request cannot sign anyone in", () => {
      for (const state of EVERY_STATE.filter((s) => s !== VERIFYING)) {
        expect(authTransition(state, { type: "code-settled", outcome: SIGNED_IN })).toBe(state);
      }
    });
  });

  describe("cancelling", () => {
    test("lands signed-out with nothing said", () => {
      expect(authTransition(CHALLENGED, { type: "cancel-challenge" })).toEqual(SIGNED_OUT);
    });

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

    test("does nothing anywhere else. Nothing but a challenge can lapse", () => {
      for (const state of EVERY_STATE.filter((s) => s.status !== "two-factor")) {
        expect(authTransition(state, { type: "challenge-lapsed" })).toBe(state);
      }
    });
  });

  /**
   * The credential the challenge holds must not survive any of them. There is
   * only one place it lives, so this is the same assertion five times: whatever
   * the state is afterwards, it is not one carrying a challenge.
   */
  test("every way out discards the challenge", () => {
    const exits: AuthEvent[] = [
      { type: "code-settled", outcome: SIGNED_IN },
      { type: "cancel-challenge" },
      { type: "challenge-lapsed" },
      { type: "sign-out" },
      { type: "expired" },
    ];

    for (const event of exits) {
      expect(authTransition(VERIFYING, event).status).not.toBe("two-factor");
    }
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
  test("ends the session and says why, so no screen is left silently empty", () => {
    expect(authTransition(AUTHENTICATED, { type: "expired" })).toEqual({
      status: "signed-out",
      notice: EXPIRED_NOTICE,
    });
  });

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

  test("a transport failure is not one of these, at either seam it can arrive by", () => {
    // The line #19 drew, as the machine sees it: a request that got no answer
    // reaches the machine as `transport-failure`, which keeps the cookie at
    // hydration and only says so at sign-in. It never becomes `expired` —
    // `saysSessionExpired` in `lib/auth-response` refuses to call it one, and
    // `lib/auth-service` clears nothing for it.
    expect(
      authTransition(HYDRATING, { type: "hydrated", outcome: OFFLINE, kept: null }),
    ).toEqual(UNREACHABLE);
    expect(authTransition(SUBMITTING, { type: "settled", outcome: OFFLINE })).toEqual({
      status: "signed-out",
      notice: OFFLINE_NOTICE,
    });
  });
});

describe("retry", () => {
  test("an Unreachable start can be tried again", () => {
    expect(authTransition(UNREACHABLE, { type: "retry" })).toEqual(HYDRATING);
  });

  test("does nothing anywhere else", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "unreachable")) {
      expect(authTransition(state, { type: "retry" })).toBe(state);
    }
  });
});

describe("as a whole", () => {
  const EVERY_EVENT: AuthEvent[] = [
    { type: "hydrated", outcome: null, kept: null },
    { type: "hydrated", outcome: SIGNED_IN, kept: null },
    { type: "hydrated", outcome: OFFLINE, kept: null },
    { type: "hydrated", outcome: OFFLINE, kept: AGENT },
    { type: "submit" },
    { type: "settled", outcome: SIGNED_IN },
    { type: "settled", outcome: REFUSED },
    { type: "sign-out" },
    { type: "expired" },
    { type: "retry" },
    { type: "confirmed", user: CUSTOMER },
    { type: "settled", outcome: TWO_FACTOR },
    { type: "submit-code" },
    { type: "code-settled", outcome: SIGNED_IN },
    { type: "code-settled", outcome: REFUSED },
    { type: "cancel-challenge" },
    { type: "challenge-lapsed" },
    { type: "account-updated", user: CUSTOMER },
    { type: "reconfirmed", user: CUSTOMER },
  ];

  test("every state/event pair lands on a state, and none mutates its input", () => {
    for (const state of EVERY_STATE) {
      for (const event of EVERY_EVENT) {
        const before = JSON.stringify(state);
        const next = authTransition(state, event);
        expect(typeof next.status).toBe("string");
        expect(JSON.stringify(state)).toBe(before);
      }
    }
  });

  test("a full session: cold start, refusal, retype, in, out", () => {
    let state = INITIAL_AUTH_STATE;
    state = authTransition(state, { type: "hydrated", outcome: null, kept: null });
    expect(state).toEqual(SIGNED_OUT);

    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: REFUSED });
    expect(state).toEqual({ status: "signed-out", notice: "Invalid email or password." });

    state = authTransition(state, { type: "submit" });
    expect(state).toEqual(SUBMITTING);
    state = authTransition(state, { type: "settled", outcome: SIGNED_IN });
    expect(state).toEqual(AUTHENTICATED);

    state = authTransition(state, { type: "sign-out" });
    expect(state).toEqual(SIGNED_OUT);
  });

  test("a session that expires mid-use lands on sign-in with an explanation", () => {
    let state: AuthState = INITIAL_AUTH_STATE;
    state = authTransition(state, { type: "hydrated", outcome: SIGNED_IN, kept: null });
    expect(state).toEqual(AUTHENTICATED);

    state = authTransition(state, { type: "expired" });
    expect(state).toEqual({ status: "signed-out", notice: EXPIRED_NOTICE });

    // And nothing of the previous person survives into the next sign-in.
    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: { kind: "signed-in", cookie: SESSION_COOKIE, user: CUSTOMER } });
    expect(state).toEqual({ status: "signed-in", user: CUSTOMER, stale: false });
  });

  test("a cold start with no network, and the network coming back", () => {
    let state: AuthState = INITIAL_AUTH_STATE;
    // Airplane mode: a cookie on the device, a person beside it, nobody to ask.
    state = authTransition(state, { type: "hydrated", outcome: OFFLINE, kept: AGENT });
    expect(state).toEqual(STALE);

    // The screens have somebody to draw for, which is what the Store restores
    // against — `lib/conversation-inbox` keys on exactly this id.
    expect(state).toMatchObject({ status: "signed-in", user: { id: AGENT.id } });

    state = authTransition(state, { type: "confirmed", user: AGENT });
    expect(state).toEqual(AUTHENTICATED);
  });

  test("a full sign-in with two-factor on: password, wrong code, right code, in", () => {
    let state: AuthState = SIGNED_OUT;

    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: TWO_FACTOR });
    expect(state).toEqual(CHALLENGED);

    state = authTransition(state, { type: "submit-code" });
    state = authTransition(state, {
      type: "code-settled",
      outcome: { kind: "unauthorised", message: "That code was not accepted." },
    });
    // Still in the handshake, and still holding the credential for it.
    expect(state).toEqual({ ...CHALLENGED, notice: "That code was not accepted." });

    state = authTransition(state, { type: "submit-code" });
    state = authTransition(state, { type: "code-settled", outcome: SIGNED_IN });
    expect(state).toEqual(AUTHENTICATED);
  });

  test("a challenge somebody backs out of retains nothing of the attempt", () => {
    let state: AuthState = SIGNED_OUT;
    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: TWO_FACTOR });
    state = authTransition(state, { type: "cancel-challenge" });

    expect(state).toEqual(SIGNED_OUT);
    // And the sign-in screen is the ordinary one, with nothing standing on it.
    expect(state).toEqual({ status: "signed-out", notice: null });
  });

  test("a challenge left too long sends them back to the start, and says why", () => {
    let state: AuthState = SIGNED_OUT;
    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: TWO_FACTOR });
    state = authTransition(state, { type: "challenge-lapsed" });
    expect(state).toEqual({ status: "signed-out", notice: CHALLENGE_LAPSED_NOTICE });

    // And the password path still works from there, as it does after any refusal.
    state = authTransition(state, { type: "submit" });
    state = authTransition(state, { type: "settled", outcome: SIGNED_IN });
    expect(state).toEqual(AUTHENTICATED);
  });

  test("a cold start with no network, over a session that expired meanwhile", () => {
    let state: AuthState = INITIAL_AUTH_STATE;
    state = authTransition(state, { type: "hydrated", outcome: OFFLINE, kept: AGENT });
    expect(state).toEqual(STALE);

    // The confirming request is authenticated, so a 401 to it is an ordinary
    // expiry rather than a second hydration quietly signing somebody out.
    state = authTransition(state, { type: "expired" });
    expect(state).toEqual({ status: "signed-out", notice: EXPIRED_NOTICE });
  });
});
