import {
  authTransition,
  INITIAL_AUTH_STATE,
  OFFLINE_NOTICE,
  TWO_FACTOR_NOTICE,
  UNREADABLE_NOTICE,
  type AuthEvent,
  type AuthState,
} from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import type { SessionUser } from "@/lib/types";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
};

const CUSTOMER: SessionUser = { ...AGENT, role: "customer" };

const SESSION_COOKIE = "better-auth.session_token=abc.def";

const SIGNED_IN: AuthOutcome = { kind: "signed-in", cookie: SESSION_COOKIE, user: AGENT };
const TWO_FACTOR: AuthOutcome = { kind: "two-factor" };
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
const AUTHENTICATED: AuthState = { status: "signed-in", user: AGENT };

const EVERY_STATE: AuthState[] = [
  HYDRATING,
  SIGNED_OUT,
  { status: "signed-out", notice: "something was said" },
  SUBMITTING,
  AUTHENTICATED,
  UNREACHABLE,
];

test("a cold start begins by hydrating", () => {
  expect(INITIAL_AUTH_STATE).toEqual(HYDRATING);
});

describe("hydration", () => {
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
    expect(authTransition(HYDRATING, { type: "hydrated", outcome })).toEqual(expected);
  });

  test("a hydration result that arrives after hydrating ended is ignored", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "hydrating")) {
      expect(authTransition(state, { type: "hydrated", outcome: SIGNED_IN })).toEqual(state);
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
    ["two-factor is refused and points at the web app", TWO_FACTOR, { status: "signed-out", notice: TWO_FACTOR_NOTICE }],
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
    });
  });

  test("a response that outlived its request cannot sign anyone back in", () => {
    for (const state of EVERY_STATE.filter((s) => s.status !== "submitting")) {
      expect(authTransition(state, { type: "settled", outcome: SIGNED_IN })).toBe(state);
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
    { type: "hydrated", outcome: null },
    { type: "hydrated", outcome: SIGNED_IN },
    { type: "hydrated", outcome: OFFLINE },
    { type: "submit" },
    { type: "settled", outcome: SIGNED_IN },
    { type: "settled", outcome: REFUSED },
    { type: "sign-out" },
    { type: "retry" },
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
    state = authTransition(state, { type: "hydrated", outcome: null });
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
});
