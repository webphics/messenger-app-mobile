import { authTransition } from "@/lib/auth-machine";
import type { AuthState } from "@/lib/auth-machine";
import {
  APPLE_FAILED_NOTICE,
  APPLE_UNAVAILABLE_NOTICE,
  appleAuthEvent,
  appleNameSettled,
  appleNameToSend,
  interpretAppleCredential,
  interpretAppleFailure,
  interpretAppleNonce,
  parseAppleName,
  serialiseAppleName,
  type AppleResult,
} from "@/lib/apple-auth";

const ID_TOKEN = "eyJraWQiOiJXNldjT0tCIiwiYWxnIjoiUlMyNTYifQ.payload.signature";
const CODE = "c1a9f0e2b7d34.0.abcd.efgh";
const APPLE_USER = "000123.0a1b2c3d4e5f.0456";
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
        user: APPLE_USER,
        identityToken: ID_TOKEN,
        authorizationCode: CODE,
        fullName: { givenName: " Ada ", familyName: "Lovelace", middleName: null },
        email: "x7k2mq9pd4@privaterelay.appleid.com",
      }),
    ).toEqual({
      kind: "credential",
      appleUserId: APPLE_USER,
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
        user: APPLE_USER,
        identityToken: ID_TOKEN,
        authorizationCode: CODE,
        fullName: { givenName: null, familyName: "" },
      }),
    ).toEqual({
      kind: "credential",
      appleUserId: APPLE_USER,
      idToken: ID_TOKEN,
      authorizationCode: CODE,
    });
  });

  test.each([
    ["no token", { user: APPLE_USER, identityToken: null, authorizationCode: CODE }],
    ["no code", { user: APPLE_USER, identityToken: ID_TOKEN, authorizationCode: null }],
    ["an empty code", { user: APPLE_USER, identityToken: ID_TOKEN, authorizationCode: "  " }],
    ["no user id", { identityToken: ID_TOKEN, authorizationCode: CODE }],
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

describe("reading the nonce response", () => {
  test("a nonce and its hash", () => {
    expect(
      interpretAppleNonce({
        reached: true,
        status: 200,
        body: { data: { nonce: "raw", hashedNonce: "hash" } },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "nonce", nonce: "raw", hashedNonce: "hash" });
  });

  test("a server without Apple configured", () => {
    expect(
      interpretAppleNonce({
        reached: true,
        status: 503,
        body: { code: "apple_sign_in_unavailable" },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  test.each([
    ["no hash", { reached: true as const, status: 200, body: { data: { nonce: "raw" } }, sessionCookie: null }],
    ["a 500", { reached: true as const, status: 500, body: null, sessionCookie: null }],
  ])("%s is a failure", (_label, outcome) => {
    expect(interpretAppleNonce(outcome)).toEqual({ kind: "failed" });
  });

  test("no network is told apart, so the machine can say offline", () => {
    expect(interpretAppleNonce({ reached: false })).toEqual({ kind: "unreached" });
  });
});

describe("the name Apple shares once", () => {
  test("this attempt's name wins over a kept one", () => {
    expect(appleNameToSend({ givenName: "Ada" }, { givenName: "Old", familyName: "Name" })).toEqual({
      givenName: "Ada",
    });
  });

  test("without one, the kept name is sent", () => {
    expect(appleNameToSend({}, { familyName: "Lovelace" })).toEqual({ familyName: "Lovelace" });
    expect(appleNameToSend({ givenName: undefined }, null)).toEqual({});
  });

  test("it round-trips through the keychain, and nothing unreadable comes back", () => {
    expect(parseAppleName(serialiseAppleName({ givenName: "Ada", familyName: "Lovelace" }))).toEqual({
      givenName: "Ada",
      familyName: "Lovelace",
    });
    expect(parseAppleName("{not json")).toBeNull();
    expect(parseAppleName(JSON.stringify({ givenName: "  " }))).toBeNull();
    expect(parseAppleName(null)).toBeNull();
  });

  test.each([
    [{ kind: "signed-in" as const, cookie: "c", user: {} as never }, true],
    [{ kind: "two-factor" as const, challenge: "c" }, true],
    [{ kind: "transport-failure" as const }, false],
    [{ kind: "unauthorised" as const, message: "no" }, false],
  ])("is let go only once an account holds it (%p)", (outcome, settled) => {
    expect(appleNameSettled(outcome)).toBe(settled);
  });
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

  test("a server without Apple says so in words, not as a failure to sign in", () => {
    expect(appleAuthEvent({ kind: "unavailable" })).toEqual({
      type: "settled",
      outcome: { kind: "server-error", message: APPLE_UNAVAILABLE_NOTICE },
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
