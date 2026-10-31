import { authTransition } from "@/lib/auth-machine";
import type { AuthState } from "@/lib/auth-machine";
import {
  APPLE_FAILED_NOTICE,
  appleAuthEvent,
  interpretAppleCredential,
  interpretAppleFailure,
  type AppleResult,
} from "@/lib/apple-auth";

const ID_TOKEN = "eyJraWQiOiJXNldjT0tCIiwiYWxnIjoiUlMyNTYifQ.payload.signature";
const CODE = "c1a9f0e2b7d34.0.abcd.efgh";
const CHALLENGE = "better-auth.two_factor=chal.lenge";
const SUBMITTING: AuthState = { status: "submitting" };

function after(result: AppleResult, from: AuthState = SUBMITTING): AuthState {
  const event = appleAuthEvent(result);
  return event ? authTransition(from, event) : from;
}

describe("reading what the sheet resolved with", () => {
  test("a first authorisation carries the name the person shared", () => {
    expect(
      interpretAppleCredential({
        user: "000123.abc",
        identityToken: ID_TOKEN,
        authorizationCode: CODE,
        fullName: { givenName: " Ada ", familyName: "Lovelace", middleName: null },
        email: "x7k2mq9pd4@privaterelay.appleid.com",
      }),
    ).toEqual({
      kind: "credential",
      idToken: ID_TOKEN,
      authorizationCode: CODE,
      givenName: "Ada",
      familyName: "Lovelace",
    });
  });

  // Apple sends the name once. Every later sign-in, and any where it was
  // withheld, has none — and must not send empty strings in its place.
  test("a later authorisation, or a withheld name, sends no name at all", () => {
    expect(
      interpretAppleCredential({
        identityToken: ID_TOKEN,
        authorizationCode: CODE,
        fullName: { givenName: null, familyName: "" },
      }),
    ).toEqual({ kind: "credential", idToken: ID_TOKEN, authorizationCode: CODE });
  });

  test.each([
    ["no token", { identityToken: null, authorizationCode: CODE }],
    ["no code", { identityToken: ID_TOKEN, authorizationCode: null }],
    ["an empty code", { identityToken: ID_TOKEN, authorizationCode: "  " }],
    ["nothing", undefined],
  ])("%s is a failure, not a sign-in", (_label, credential) => {
    expect(interpretAppleCredential(credential)).toEqual({ kind: "failed" });
  });
});

test("closing the sheet is told apart from an ordinary failure", () => {
  expect(interpretAppleFailure({ code: "ERR_REQUEST_CANCELED" })).toEqual({
    kind: "cancelled",
  });
  expect(interpretAppleFailure({ code: "ERR_REQUEST_FAILED" })).toEqual({ kind: "failed" });
  expect(interpretAppleFailure(new Error("boom"))).toEqual({ kind: "failed" });
});

describe("what the machine does with a finished attempt", () => {
  test("dismissing the sheet is no event and leaves a standing notice standing", () => {
    const expired: AuthState = {
      status: "signed-out",
      notice: "Your session expired. Sign in again.",
    };
    expect(appleAuthEvent({ kind: "cancelled" })).toBeNull();
    expect(after({ kind: "cancelled" }, expired)).toEqual(expired);
  });

  test("a native failure says so, without touching a stored credential", () => {
    expect(appleAuthEvent({ kind: "failed" })).toEqual({
      type: "settled",
      outcome: { kind: "server-error", message: APPLE_FAILED_NOTICE },
    });
  });

  // Apple must not become a way around the second factor either.
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

  test.each<AppleResult>([
    { kind: "failed" },
    { kind: "settled", outcome: { kind: "unauthorised", message: "Account disabled." } },
    { kind: "settled", outcome: { kind: "transport-failure" } },
    { kind: "settled", outcome: { kind: "malformed" } },
  ])("nothing short of an issued session signs anyone in (%p)", (result) => {
    expect(after(result).status).toBe("signed-out");
  });
});
