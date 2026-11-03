import { authTransition } from "@/lib/auth-machine";
import type { AuthState } from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import {
  googleAuthEvent,
  interpretGoogleFailure,
  interpretGoogleResponse,
  type GoogleResult,
} from "@/lib/google-auth";
import type { SessionUser } from "@/lib/types";

const ID_TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.payload.signature";

const CUSTOMER: SessionUser = {
  id: "0f2c3e2b-9a7e-4f0a-9f5b-2b6a1d7f4c11",
  name: "Ada Customer",
  email: "ada@example.com",
  role: "customer",
  hasPassword: true,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
  username: null,
  phone: null,
  image: null,
};

const SUBMITTING: AuthState = { status: "submitting" };
const CHALLENGE = "better-auth.two_factor=chal.lenge";

function after(result: GoogleResult, from: AuthState = SUBMITTING): AuthState {
  const event = googleAuthEvent(result);
  return event ? authTransition(from, event) : from;
}

describe("reading what the native call resolved with", () => {
  test("an account picked and a token minted", () => {
    expect(
      interpretGoogleResponse({ type: "success", data: { idToken: ID_TOKEN } }),
    ).toEqual({ kind: "token", idToken: ID_TOKEN });
  });

  test("the sheet dismissed", () => {
    expect(interpretGoogleResponse({ type: "cancelled" })).toEqual({ kind: "cancelled" });
  });

  test.each([
    ["an empty token", { type: "success", data: { idToken: "   " } }],
    ["nothing", null],
  ])("%s is a failure, not a sign-in", (_label, response) => {
    expect(interpretGoogleResponse(response)).toEqual({ kind: "failed" });
  });
});

test("Play services missing is told apart from an ordinary failure", () => {
  expect(interpretGoogleFailure({ code: "PLAY_SERVICES_NOT_AVAILABLE" })).toEqual({
    kind: "no-play-services",
  });
  expect(interpretGoogleFailure(new Error("boom"))).toEqual({ kind: "failed" });
});

describe("what the machine does with a finished attempt", () => {
  test("a session issued signs the person in, in the role the server gave", () => {
    const outcome: AuthOutcome = {
      kind: "signed-in",
      cookie: "better-auth.session_token=abc",
      user: CUSTOMER,
    };
    expect(after({ kind: "settled", outcome })).toEqual({
      status: "signed-in",
      user: CUSTOMER,
      stale: false,
    });
  });

  test("dismissing the sheet is no event and leaves a standing notice standing", () => {
    const expired: AuthState = {
      status: "signed-out",
      notice: "Your session expired. Sign in again.",
    };
    expect(googleAuthEvent({ kind: "cancelled" })).toBeNull();
    expect(after({ kind: "cancelled" }, expired)).toEqual(expired);
  });

  // Google must not become a way around the second factor.
  test("a two-factor challenge asks for a code, exactly as a password does", () => {
    expect(
      after({ kind: "settled", outcome: { kind: "two-factor", challenge: CHALLENGE } }),
    ).toEqual({
      status: "two-factor",
      challenge: CHALLENGE,
      verifying: false,
      notice: null,
    });
  });

  test("the server rejecting the identity leaves nobody signed in", () => {
    expect(
      after({
        kind: "settled",
        outcome: { kind: "unauthorised", message: "Account disabled." },
      }),
    ).toEqual({ status: "signed-out", notice: "Account disabled." });
  });

  test.each<GoogleResult>([
    { kind: "no-play-services" },
    { kind: "failed" },
    { kind: "settled", outcome: { kind: "transport-failure" } },
    { kind: "settled", outcome: { kind: "malformed" } },
  ])("nothing short of an issued session signs anyone in (%p)", (result) => {
    expect(after(result).status).toBe("signed-out");
  });
});
