import { CSRF_REFUSED_CODE } from "@/lib/api-envelope";
import {
  CODE_REFUSED_NOTICE,
  interpretGoogleSignIn,
  interpretMagicLinkRequest,
  interpretMagicLinkVerify,
  interpretSession,
  interpretSignIn,
  interpretTwoFactorVerify,
  parseSessionUser,
  saysSessionExpired,
  type HttpOutcome,
} from "@/lib/auth-response";

/** A `data` payload shaped like the API's, trimmed to the fields this client reads. */
function apiUser(over: Record<string, unknown> = {}) {
  return {
    id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
    publicId: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
    name: "Admin",
    email: "admin@talo.com",
    emailVerified: true,
    image: null,
    phone: null,
    role: "admin",
    twoFactorEnabled: false,
    hasPassword: true,
    ...over,
  };
}

function envelope(data: unknown, message = "Login successful") {
  return {
    statusCode: 200,
    message,
    data,
    timestamp: "2026-08-31T17:49:52.972Z",
    path: "/auth/login",
  };
}

const ISSUED = "better-auth.session_token=issued";
const HELD = "better-auth.session_token=held";

function ok(body: unknown, sessionCookie: string | null = ISSUED): HttpOutcome {
  return { reached: true, status: 200, body, sessionCookie };
}

const CHALLENGE = "better-auth.two_factor=chal.lenge";

/**
 * The challenge as it actually arrives on all three sign-in routes: a 200
 * carrying no session at all, and one short-lived cookie that is the entire
 * credential for the second half of the handshake.
 */
function challenged(challengeCookie: string | null = CHALLENGE): HttpOutcome {
  return {
    reached: true,
    status: 200,
    body: envelope(
      { twoFactorRedirect: true, twoFactorMethods: ["totp"] },
      "Two-factor authentication required",
    ),
    sessionCookie: null,
    challengeCookie,
  };
}

describe("parseSessionUser", () => {
  test("reads the fields this client acts on", () => {
    expect(parseSessionUser(apiUser())).toEqual({
      id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
      name: "Admin",
      email: "admin@talo.com",
      role: "admin",
      hasPassword: true,
      twoFactorEnabled: false,
      supportAssignmentEnabled: false,
      capabilities: [],
    });
  });

  /**
   * The two fields the account screens gate on. They are the one place this
   * parse defaults rather than drops, and the default is the safe direction: a
   * field this client did not receive hides a control instead of drawing one
   * that acts on an assumption the payload never made.
   */
  describe("the account-state flags", () => {
    test.each(["hasPassword"] as const)(
      "a payload with no %s reads as false rather than dropping the person",
      (field) => {
        const payload = apiUser();
        delete (payload as Record<string, unknown>)[field];

        const user = parseSessionUser(payload);
        expect(user).not.toBeNull();
        expect(user?.[field]).toBe(false);
      },
    );
  });

  /**
   * The assignment switch, which is server-wide rather than about this person.
   * It defaults the same way as the account flags and for the same reason:
   * off is a Shared queue, which offers nobody an Engage the API would refuse.
   */
  describe("supportAssignmentEnabled", () => {
    test.each([
      ["on", true, true],
      // A session from an API that predates the switch.
      ["missing", undefined, false],
    ])("%s reads as %s", (_label, value, expected) => {
      const payload = apiUser({ supportAssignmentEnabled: value });
      if (value === undefined) delete (payload as Record<string, unknown>).supportAssignmentEnabled;

      expect(parseSessionUser(payload)?.supportAssignmentEnabled).toBe(expected);
    });
  });

  /**
   * The viewer's effective set, which the API computes (root ADR 0017). Like the
   * flags above it defaults rather than drops the person, and the default is
   * holding nothing, which hides a control rather than drawing one.
   */
  describe("capabilities", () => {
    test("drops names this build does not know and keeps the person", () => {
      const user = parseSessionUser(
        apiUser({ capabilities: ["close", "create_labels", "teleport", 7] }),
      );

      expect(user).not.toBeNull();
      expect(user?.capabilities).toEqual(["close"]);
    });
  });

  test("an unknown role fails the parse rather than defaulting to one", () => {
    expect(parseSessionUser(apiUser({ role: "contact" }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: "superuser" }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: null }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: undefined }))).toBeNull();
  });

  test.each([null, { id: "x" }])(
    "rejects the malformed payload %p",
    (payload) => {
      expect(parseSessionUser(payload)).toBeNull();
    },
  );

  test("rejects a payload missing an id or an email", () => {
    expect(parseSessionUser(apiUser({ id: "" }))).toBeNull();
    expect(parseSessionUser(apiUser({ email: null }))).toBeNull();
  });
});

describe("interpretSignIn", () => {
  test("a credential and a readable user is a sign-in", () => {
    expect(interpretSignIn(ok(envelope(apiUser())))).toEqual({
      kind: "signed-in",
      cookie: ISSUED,
      user: {
        id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
        name: "Admin",
        email: "admin@talo.com",
        role: "admin",
        hasPassword: true,
        twoFactorEnabled: false,
        supportAssignmentEnabled: false,
        capabilities: [],
      },
    });
  });

  test("a request that never got an answer is a transport failure", () => {
    expect(interpretSignIn({ reached: false })).toEqual({ kind: "transport-failure" });
  });

  test("a two-factor challenge is its own outcome, not a sign-in", () => {
    // The API returns the challenge as a 200 and deliberately sets no session
    // cookie. What it does set is the credential for the second half.
    expect(interpretSignIn(challenged())).toEqual({
      kind: "two-factor",
      challenge: CHALLENGE,
    });
  });

  /**
   * The one case that has to be told apart from a challenge rather than folded
   * into it: `POST /auth/two-factor/verify-totp` is identified by the challenge
   * cookie and by nothing else, so a handshake that arrived without one cannot
   * be finished by anything anybody types. Drawing a code field over it would
   * ask somebody to spend a code on a request that could only be refused.
   */
  test("a challenge that set no cookie is unreadable, not a challenge", () => {
    expect(interpretSignIn(challenged(null))).toEqual({ kind: "malformed" });
  });

  test("a challenge whose cookie came back blank is unreadable too", () => {
    expect(interpretSignIn(challenged("   "))).toEqual({ kind: "malformed" });
  });

  /**
   * An `HttpOutcome` built before this field existed, which is most of them in
   * this repo. Missing and null mean the same thing, and the challenge is the
   * only branch that reads either.
   */
  test("an outcome carrying no challenge field at all is read as carrying none", () => {
    const withoutTheField: HttpOutcome = {
      reached: true,
      status: 200,
      body: envelope({ twoFactorRedirect: true }),
      sessionCookie: null,
    };
    expect(interpretSignIn(withoutTheField)).toEqual({ kind: "malformed" });
  });

  test("wrong credentials are unauthorised, carrying the server's own words", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 401,
      body: {
        statusCode: 401,
        code: "invalid_credentials",
        message: "Invalid email or password.",
      },
      sessionCookie: null,
    };
    expect(interpretSignIn(outcome)).toEqual({
      kind: "unauthorised",
      message: "Invalid email or password.",
    });
  });

  test.each([[429, "Too many login attempts. Please try again later."]])(
    "a %s is a server error, not a verdict on the password",
    (status, message) => {
      const outcome: HttpOutcome = {
        reached: true,
        status,
        body: { message },
        sessionCookie: null,
      };
      expect(interpretSignIn(outcome)).toEqual({ kind: "server-error", message });
    },
  );

  test("a CSRF refusal is a server error, not a bad password — retyping cannot fix it", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 403,
      body: {
        statusCode: 403,
        code: "csrf_invalid",
        message: "Invalid CSRF token. Perhaps your browser blocked 3rd-party cookies.",
      },
      sessionCookie: null,
    };
    expect(interpretSignIn(outcome)).toEqual({
      kind: "server-error",
      message:
        "Could not start a secure connection to the server. Check your connection and try again.",
    });
  });

  test("a success with no Session cookie is unusable, not a sign-in", () => {
    expect(interpretSignIn(ok(envelope(apiUser()), null))).toEqual({ kind: "malformed" });
    expect(interpretSignIn(ok(envelope(apiUser()), "   "))).toEqual({ kind: "malformed" });
  });

  test.each([
    ["no body at all", null],
    ["a user with an unknown role", envelope(apiUser({ role: "contact" }))],
  ])("a malformed success (%s) is reported as malformed", (_label, body) => {
    expect(interpretSignIn(ok(body))).toEqual({ kind: "malformed" });
  });
});

describe("interpretSession", () => {
  test("carries the cookie being verified rather than expecting a new one", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 200,
      body: envelope(apiUser({ role: "agent" }), "Session retrieved successfully"),
      sessionCookie: null,
    };
    expect(interpretSession(outcome, HELD)).toEqual({
      kind: "signed-in",
      cookie: HELD,
      user: {
        id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
        name: "Admin",
        email: "admin@talo.com",
        role: "agent",
        hasPassword: true,
        twoFactorEnabled: false,
        supportAssignmentEnabled: false,
        capabilities: [],
      },
    });
  });

  test("a dead cookie is unauthorised", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 401,
      body: { statusCode: 401, code: "unauthorized", message: "Unauthorized" },
      sessionCookie: null,
    };
    expect(interpretSession(outcome, HELD)).toEqual({
      kind: "unauthorised",
      message: "Unauthorized",
    });
  });

  test("a banned account's 403 is unauthorised", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 403,
      body: { statusCode: 403, code: "user_banned", message: "Your account has been banned" },
      sessionCookie: null,
    };
    expect(interpretSession(outcome, HELD)).toEqual({
      kind: "unauthorised",
      message: "Your account has been banned",
    });
  });

  test("a 403 the API did not code is a server error, so the cookie survives a proxy's refusal", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 403,
      body: null,
      sessionCookie: null,
    };
    expect(interpretSession(outcome, HELD).kind).toBe("server-error");
  });

  test("an unanswered request is a transport failure, which is not the same as a dead cookie", () => {
    expect(interpretSession({ reached: false }, HELD)).toEqual({
      kind: "transport-failure",
    });
  });

  test.each([500])(
    "a %s is a server error, so the cookie survives a bad deploy",
    (status) => {
      const outcome: HttpOutcome = {
        reached: true,
        status,
        body: { message: "Service unavailable" },
        sessionCookie: null,
      };
      expect(interpretSession(outcome, HELD)).toEqual({
        kind: "server-error",
        message: "Service unavailable",
      });
    },
  );

  test.each([["a truncated user", envelope({ id: "abc" })]])("a malformed success (%s) is reported as malformed", (_label, body) => {
    const outcome: HttpOutcome = { reached: true, status: 200, body, sessionCookie: null };
    expect(interpretSession(outcome, HELD)).toEqual({ kind: "malformed" });
  });
});

describe("saysSessionExpired", () => {
  function answer(status: number, body: unknown = null): HttpOutcome {
    return { reached: true, status, body, sessionCookie: null };
  }

  test("a 401 is the session no longer being accepted", () => {
    expect(saysSessionExpired(answer(401, { message: "Unauthorized" }))).toBe(true);
  });

  test("a request that never got an answer says nothing about the cookie", () => {
    expect(saysSessionExpired({ reached: false })).toBe(false);
  });

  test("a 403 is a verdict on the request, not on the session", () => {
    // The role is not allowed, the email is unverified, the CSRF pair was refused
    // — none of which a fresh sign-in fixes, and all of which arrive as 403.
    expect(saysSessionExpired(answer(403, { code: CSRF_REFUSED_CODE }))).toBe(false);
    expect(saysSessionExpired(answer(403, { message: "Forbidden" }))).toBe(false);
  });
});

describe("interpretMagicLinkVerify", () => {
  test("an expired or already-used link is refused in the API's own words", () => {
    // The API cannot tell the two apart — both are a token that is no longer
    // good — and answers both with this one sentence.
    const message =
      "This magic link is invalid, expired, or has already been used. Please request a new one.";
    expect(
      interpretMagicLinkVerify({
        reached: true,
        status: 401,
        body: { code: "invalid_magic_link", message },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "unauthorised", message });
  });

  test("a verified link with no cookie establishes nothing", () => {
    expect(interpretMagicLinkVerify(ok(envelope(apiUser()), null))).toEqual({
      kind: "malformed",
    });
  });
});

describe("interpretGoogleSignIn", () => {
  // The audience arrangement failing looks exactly like this: a token Google was
  // happy to mint, refused by our own server. It is a refusal, not a crash.
  test("a token the API would not verify establishes nothing", () => {
    expect(
      interpretGoogleSignIn({
        reached: true,
        status: 400,
        body: { code: "bad_request", message: "Invalid Google ID token." },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "server-error", message: "Invalid Google ID token." });
  });

  test("an accepted identity with no cookie establishes nothing", () => {
    expect(interpretGoogleSignIn(ok(envelope(apiUser()), null))).toEqual({
      kind: "malformed",
    });
  });
});

describe("interpretMagicLinkRequest", () => {
  function sent(path = "/auth/magic-link") {
    return {
      statusCode: 200,
      message: "Magic link sent successfully",
      data: true,
      timestamp: "2026-08-31T17:49:52.972Z",
      path,
    };
  }

  test("the API confirming the send is a send", () => {
    expect(interpretMagicLinkRequest(ok(sent(), null))).toEqual({ kind: "sent" });
  });

  test("a 2xx that does not confirm the send is not a send", () => {
    // Confirming an address that was never written to is the one failure this
    // screen cannot recover from — nobody waits for a second email.
    expect(interpretMagicLinkRequest(ok({ ...sent(), data: false }, null))).toEqual({
      kind: "refused",
      message: "Could not send a sign-in link right now. Try again in a moment.",
    });
    expect(interpretMagicLinkRequest(ok(null, null))).toMatchObject({ kind: "refused" });
  });

  test("a request that never got an answer is a transport failure", () => {
    expect(interpretMagicLinkRequest({ reached: false })).toEqual({
      kind: "transport-failure",
    });
  });
});

describe("interpretTwoFactorVerify", () => {
  /** The route answers 201, unlike every other one this module reads. */
  function created(body: unknown, sessionCookie: string | null = ISSUED): HttpOutcome {
    return { reached: true, status: 201, body, sessionCookie };
  }

  test("a 201 with a user and a cookie is a sign-in like any other", () => {
    expect(interpretTwoFactorVerify(created(envelope(apiUser())))).toEqual({
      kind: "signed-in",
      cookie: ISSUED,
      user: {
        id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
        name: "Admin",
        email: "admin@talo.com",
        role: "admin",
        hasPassword: true,
        twoFactorEnabled: false,
        supportAssignmentEnabled: false,
        capabilities: [],
      },
    });
  });

  test("a verified code that issued no cookie establishes nothing", () => {
    expect(interpretTwoFactorVerify(created(envelope(apiUser()), null))).toEqual({
      kind: "malformed",
    });
  });

  /**
   * The whole reason this route needs an interpreter of its own. The API folds
   * every 401 into `invalidCredentialsError()`, so a wrong code comes back
   * saying to check a username, an email or a password. Those are three
   * controls nobody was looking at, one of which was accepted a moment ago.
   */
  test("a wrong code is refused in words about a code, not about a password", () => {
    const outcome = interpretTwoFactorVerify({
      reached: true,
      status: 401,
      body: {
        statusCode: 401,
        code: "invalid_credentials",
        message: "Invalid username, email, or password.",
      },
      sessionCookie: null,
    });

    expect(outcome).toEqual({ kind: "unauthorised", message: CODE_REFUSED_NOTICE });
    expect(CODE_REFUSED_NOTICE).not.toMatch(/password/i);
  });

  /**
   * An expired challenge is the same 401 as a wrong code, because better-auth
   * raises `INVALID_CODE` and `INVALID_TWO_FACTOR_COOKIE` alike as
   * UNAUTHORIZED. This must not claim to tell them apart. The lapse is
   * announced by the clock in `lib/two-factor-challenge` instead.
   */
  test("a lapsed challenge is indistinguishable from a wrong one, and is not guessed at", () => {
    const lapsed = interpretTwoFactorVerify({
      reached: true,
      status: 401,
      body: { statusCode: 401, code: "invalid_credentials", message: "Invalid username, email, or password." },
      sessionCookie: null,
    });
    expect(lapsed).toEqual({ kind: "unauthorised", message: CODE_REFUSED_NOTICE });
  });
});
