import { authTransition, TWO_FACTOR_NOTICE } from "@/lib/auth-machine";
import type { AuthState } from "@/lib/auth-machine";
import type { AuthOutcome } from "@/lib/auth-response";
import {
  GOOGLE_FAILED_NOTICE,
  googleAuthEvent,
  interpretGoogleFailure,
  interpretGoogleResponse,
  NO_PLAY_SERVICES_NOTICE,
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
};

const SUBMITTING: AuthState = { status: "submitting" };
const SIGNED_OUT: AuthState = { status: "signed-out", notice: null };

/**
 * What the machine makes of an attempt that started from the Google button.
 *
 * A result that is not an attempt at all produces no event, and so leaves
 * whatever state it found — which is what the caller does with it too.
 */
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
    expect(interpretGoogleResponse({ type: "cancelled" })).toEqual({
      kind: "cancelled",
    });
  });

  // The token is the entire point of the call. A success without one is nothing
  // this app can send anywhere, so it must not read as a success.
  test.each([
    ["no token at all", { type: "success", data: {} }],
    ["a null token", { type: "success", data: { idToken: null } }],
    ["an empty token", { type: "success", data: { idToken: "   " } }],
    ["no data", { type: "success" }],
    ["a shape from a future version", { type: "somethingElse" }],
    ["nothing", null],
  ])("%s is a failure, not a sign-in", (_label, response) => {
    expect(interpretGoogleResponse(response)).toEqual({ kind: "failed" });
  });
});

describe("reading what the native call rejected with", () => {
  test("Play services missing or out of date", () => {
    const error = Object.assign(new Error("Play services not available"), {
      code: "PLAY_SERVICES_NOT_AVAILABLE",
    });
    expect(interpretGoogleFailure(error)).toEqual({ kind: "no-play-services" });
  });

  test.each([
    ["a second attempt already running", { code: "ASYNC_OP_IN_PROGRESS" }],
    ["a code nothing here knows", { code: "12500" }],
    ["an error with no code", new Error("boom")],
    ["a rejection that is not an error", "boom"],
  ])("%s is an ordinary failure", (_label, error) => {
    expect(interpretGoogleFailure(error)).toEqual({ kind: "failed" });
  });
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

  // Cancellation has to be distinguishable from failure, because the two behave
  // differently on screen: one says nothing, the other says something.
  test("dismissing the sheet is not an event at all", () => {
    expect(googleAuthEvent({ kind: "cancelled" })).toBeNull();
  });

  // "Returns to sign-in unchanged" has to mean unchanged. A sentence explaining
  // a session that expired a moment ago is still the true thing to say after
  // somebody opens the Google sheet and closes it again.
  test("dismissing the sheet leaves a standing notice standing", () => {
    const expired: AuthState = {
      status: "signed-out",
      notice: "Your session expired. Sign in again.",
    };
    expect(after({ kind: "cancelled" }, expired)).toEqual(expired);
  });

  test("Play services missing says so, and says it is the device", () => {
    expect(after({ kind: "no-play-services" })).toEqual({
      status: "signed-out",
      notice: NO_PLAY_SERVICES_NOTICE,
    });
  });

  test("Google failing to finish says so, and offers another way in", () => {
    expect(after({ kind: "failed" })).toEqual({
      status: "signed-out",
      notice: GOOGLE_FAILED_NOTICE,
    });
  });

  // The API's two-factor hook fires on Google sign-in as well as on a password,
  // so Google must not become a way around the limitation the password path
  // already explains.
  test("a two-factor challenge is refused with the same sentence a password gets", () => {
    expect(after({ kind: "settled", outcome: { kind: "two-factor" } })).toEqual({
      status: "signed-out",
      notice: TWO_FACTOR_NOTICE,
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

  // Story 13: succeeding with Google and failing at our API must not be
  // half-signed-in. Every way an attempt can end short of an issued session
  // ends signed-out, from the state a real attempt is in when it settles.
  test.each<GoogleResult>([
    { kind: "no-play-services" },
    { kind: "failed" },
    { kind: "settled", outcome: { kind: "two-factor" } },
    { kind: "settled", outcome: { kind: "unauthorised", message: "no" } },
    { kind: "settled", outcome: { kind: "server-error", message: "no" } },
    { kind: "settled", outcome: { kind: "transport-failure" } },
    { kind: "settled", outcome: { kind: "malformed" } },
  ])("nothing short of an issued session signs anyone in (%p)", (result) => {
    expect(after(result).status).toBe("signed-out");
  });

  // The cancellation half of the same guarantee: no event, so no state, so
  // certainly not a signed-in one.
  test("a dismissed sheet signs nobody in either", () => {
    expect(googleAuthEvent({ kind: "cancelled" })).toBeNull();
    expect(after({ kind: "cancelled" }, SIGNED_OUT)).toEqual(SIGNED_OUT);
  });
});
