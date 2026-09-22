import { CSRF_REFUSED_CODE } from "@/lib/api-envelope";
import {
  CODE_REFUSED_NOTICE,
  GOOGLE_REFUSED_NOTICE,
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
    });
  });

  /**
   * The two fields the account screens gate on. They are the one place this
   * parse defaults rather than drops, and the default is the safe direction: a
   * field this client did not receive hides a control instead of drawing one
   * that acts on an assumption the payload never made.
   */
  describe("the account-state flags", () => {
    test("both are carried through as the API sent them", () => {
      const user = parseSessionUser(
        apiUser({ hasPassword: false, twoFactorEnabled: true }),
      );

      expect(user?.hasPassword).toBe(false);
      expect(user?.twoFactorEnabled).toBe(true);
    });

    test.each(["hasPassword", "twoFactorEnabled"] as const)(
      "a payload with no %s reads as false rather than dropping the person",
      (field) => {
        const payload = apiUser();
        delete (payload as Record<string, unknown>)[field];

        const user = parseSessionUser(payload);
        expect(user).not.toBeNull();
        expect(user?.[field]).toBe(false);
      },
    );

    test.each([
      ["a string", "true"],
      ["a number", 1],
      ["null", null],
      ["an object", {}],
    ])("%s reads as false", (_label, value) => {
      const user = parseSessionUser(
        apiUser({ hasPassword: value, twoFactorEnabled: value }),
      );

      expect(user?.hasPassword).toBe(false);
      expect(user?.twoFactorEnabled).toBe(false);
    });

    test("a field that was already required still drops the person", () => {
      expect(parseSessionUser(apiUser({ id: "", twoFactorEnabled: true }))).toBeNull();
    });
  });

  test.each(["admin", "agent", "customer"] as const)("accepts the %s role", (role) => {
    expect(parseSessionUser(apiUser({ role }))?.role).toBe(role);
  });

  test("a nameless account still signs in, falling back to the email", () => {
    expect(parseSessionUser(apiUser({ name: "" }))?.name).toBe("admin@talo.com");
    expect(parseSessionUser(apiUser({ name: null }))?.name).toBe("admin@talo.com");
  });

  test("an unknown role fails the parse rather than defaulting to one", () => {
    expect(parseSessionUser(apiUser({ role: "contact" }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: "superuser" }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: null }))).toBeNull();
    expect(parseSessionUser(apiUser({ role: undefined }))).toBeNull();
  });

  test.each([null, undefined, "a string", 42, [], { id: "x" }])(
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

  test("a forbidden sign-in is also a credential refusal", () => {
    const outcome: HttpOutcome = {
      reached: true,
      status: 403,
      body: { code: "email_not_verified", message: "Email address must be verified." },
      sessionCookie: null,
    };
    expect(interpretSignIn(outcome)).toEqual({
      kind: "unauthorised",
      message: "Email address must be verified.",
    });
  });

  test.each([
    [429, "Too many login attempts. Please try again later."],
    [500, "Internal server error"],
    [502, "Bad gateway"],
    [400, "Authentication request is invalid."],
  ])(
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

  test("a refusal with no readable message still says something useful", () => {
    expect(
      interpretSignIn({ reached: true, status: 401, body: null, sessionCookie: null }),
    ).toEqual({
      kind: "unauthorised",
      message: "Could not sign in. Check your email and password.",
    });
    expect(
      interpretSignIn({ reached: true, status: 503, body: null, sessionCookie: null }),
    ).toEqual({
      kind: "server-error",
      message: "The server could not handle that right now. Try again.",
    });
  });

  test("a success with no Session cookie is unusable, not a sign-in", () => {
    expect(interpretSignIn(ok(envelope(apiUser()), null))).toEqual({ kind: "malformed" });
    expect(interpretSignIn(ok(envelope(apiUser()), "   "))).toEqual({ kind: "malformed" });
  });

  test.each([
    ["no body at all", null],
    ["a string body", "Login successful"],
    ["an envelope with no data", { statusCode: 200, message: "ok" }],
    ["an envelope wrapping a string", envelope("signed in")],
    ["a user with an unknown role", envelope(apiUser({ role: "contact" }))],
    ["a user with no email", envelope(apiUser({ email: "" }))],
    ["an array where an object belongs", envelope([apiUser()])],
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

  test("an unanswered request is a transport failure, which is not the same as a dead cookie", () => {
    expect(interpretSession({ reached: false }, HELD)).toEqual({
      kind: "transport-failure",
    });
  });

  test.each([500, 502, 503, 504, 429])(
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

  test.each([
    ["no body", null],
    ["an empty envelope", { statusCode: 200, message: "ok" }],
    ["a truncated user", envelope({ id: "abc" })],
    ["a legacy role value", envelope(apiUser({ role: "contact" }))],
  ])("a malformed success (%s) is reported as malformed", (_label, body) => {
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

  test.each([200, 201, 204, 400, 404, 409, 429, 500, 502, 503])(
    "a %s leaves the session alone",
    (status) => {
      expect(saysSessionExpired(answer(status))).toBe(false);
    },
  );
});

describe("interpretMagicLinkVerify", () => {
  test("a spent token that came back with a credential is a sign-in", () => {
    expect(interpretMagicLinkVerify(ok(envelope(apiUser({ role: "customer" }))))).toEqual({
      kind: "signed-in",
      cookie: ISSUED,
      user: {
        id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
        name: "Admin",
        email: "admin@talo.com",
        role: "customer",
        hasPassword: true,
        twoFactorEnabled: false,
      },
    });
  });

  test("a first-time email arrives as a Customer, like any other new account", () => {
    const outcome = interpretMagicLinkVerify(
      ok(envelope(apiUser({ role: "customer", name: null, hasPassword: false }))),
    );
    expect(outcome).toMatchObject({ kind: "signed-in", user: { role: "customer" } });
  });

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

  test("a tampered token is refused rather than parsed", () => {
    expect(
      interpretMagicLinkVerify({
        reached: true,
        status: 400,
        body: { code: "bad_request", message: "Authentication request is invalid." },
        sessionCookie: null,
      }),
    ).toEqual({
      kind: "server-error",
      message: "Authentication request is invalid.",
    });
  });

  test("a refusal the server did not explain does not send anyone to a password", () => {
    const outcome = interpretMagicLinkVerify({
      reached: true,
      status: 401,
      body: null,
      sessionCookie: null,
    });
    expect(outcome).toEqual({
      kind: "unauthorised",
      message: "This sign-in link could not be verified. Request a new one.",
    });
  });

  test("two-factor fires on this path too, and raises the same challenge", () => {
    expect(interpretMagicLinkVerify(challenged())).toEqual({
      kind: "two-factor",
      challenge: CHALLENGE,
    });
  });

  test("a verified link with no cookie establishes nothing", () => {
    expect(interpretMagicLinkVerify(ok(envelope(apiUser()), null))).toEqual({
      kind: "malformed",
    });
  });

  test("a link tapped with no network is a transport failure, not a bad link", () => {
    expect(interpretMagicLinkVerify({ reached: false })).toEqual({
      kind: "transport-failure",
    });
  });
});

describe("interpretGoogleSignIn", () => {
  test("a Google identity the server accepted is a sign-in like any other", () => {
    expect(interpretGoogleSignIn(ok(envelope(apiUser({ role: "customer" }))))).toEqual({
      kind: "signed-in",
      cookie: ISSUED,
      user: {
        id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
        name: "Admin",
        email: "admin@talo.com",
        role: "customer",
        hasPassword: true,
        twoFactorEnabled: false,
      },
    });
  });

  // The second way a Customer account comes into existence on this client. The
  // API creates one on first Google sign-in exactly as it does on a first link.
  test("a first-time Google account arrives as a Customer", () => {
    expect(
      interpretGoogleSignIn(
        ok(envelope(apiUser({ role: "customer", hasPassword: false }))),
      ),
    ).toMatchObject({ kind: "signed-in", user: { role: "customer" } });
  });

  // The API's two-factor hook fires on Google sign-in, so it must not be a way
  // around the second factor the password path asks for.
  test("two-factor fires on this path too, and raises the same challenge", () => {
    expect(interpretGoogleSignIn(challenged())).toEqual({
      kind: "two-factor",
      challenge: CHALLENGE,
    });
  });

  test("a rejected identity is refused in the API's own words", () => {
    const message = "This account has been disabled.";
    expect(
      interpretGoogleSignIn({
        reached: true,
        status: 401,
        body: { code: "unauthorized", message },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "unauthorised", message });
  });

  // Nobody typed a password on this path, so the backstop must not send anyone
  // to check one.
  test("a refusal the server did not explain does not send anyone to a password", () => {
    expect(
      interpretGoogleSignIn({
        reached: true,
        status: 401,
        body: null,
        sessionCookie: null,
      }),
    ).toEqual({ kind: "unauthorised", message: GOOGLE_REFUSED_NOTICE });
  });

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

  test("a dead network between here and the API is not a bad account", () => {
    expect(interpretGoogleSignIn({ reached: false })).toEqual({
      kind: "transport-failure",
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

  test("a send carries nothing an address could differ by", () => {
    // The API answers a first-time email exactly as it answers a known one — the
    // Customer is created on verification — and this outcome has no room to
    // reintroduce the difference. A field here saying which it was is how a
    // sign-in form quietly becomes a way of asking who has an account.
    expect(Object.keys(interpretMagicLinkRequest(ok(sent(), null)))).toEqual(["kind"]);
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

  test("a rate limit is repeated in the server's words", () => {
    const message = "Too many login attempts. Please try again later.";
    expect(
      interpretMagicLinkRequest({
        reached: true,
        status: 429,
        body: { code: "rate_limit_exceeded", message },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "refused", message });
  });

  test("a CSRF refusal says what a person can act on, not what the guard said", () => {
    expect(
      interpretMagicLinkRequest({
        reached: true,
        status: 403,
        body: { code: CSRF_REFUSED_CODE, message: "invalid csrf token" },
        sessionCookie: null,
      }),
    ).toEqual({
      kind: "refused",
      message:
        "Could not start a secure connection to the server. Check your connection and try again.",
    });
  });

  test("a refusal with nothing to say still says something", () => {
    expect(
      interpretMagicLinkRequest({
        reached: true,
        status: 500,
        body: null,
        sessionCookie: null,
      }),
    ).toEqual({
      kind: "refused",
      message: "Could not send a sign-in link right now. Try again in a moment.",
    });
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
   * saying to check a username, an email or a password — three controls nobody
   * was looking at, one of which was accepted a moment ago.
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
   * An expired challenge is the same 401 as a wrong code — better-auth raises
   * `INVALID_CODE` and `INVALID_TWO_FACTOR_COOKIE` alike as UNAUTHORIZED — so
   * this must not claim to tell them apart. The lapse is announced by the clock
   * in `lib/two-factor-challenge` instead.
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

  // Not about the code, so the server keeps its own words here.
  test("a rate limit is repeated in the server's words", () => {
    const message = "Too many login attempts. Please try again later.";
    expect(
      interpretTwoFactorVerify({
        reached: true,
        status: 429,
        body: { code: "rate_limit_exceeded", message },
        sessionCookie: null,
      }),
    ).toEqual({ kind: "server-error", message });
  });

  test("a CSRF refusal still says the thing retyping cannot fix", () => {
    expect(
      interpretTwoFactorVerify({
        reached: true,
        status: 403,
        body: { code: CSRF_REFUSED_CODE, message: "invalid csrf token" },
        sessionCookie: null,
      }),
    ).toEqual({
      kind: "server-error",
      message:
        "Could not start a secure connection to the server. Check your connection and try again.",
    });
  });

  test("a request that never got an answer is a transport failure", () => {
    expect(interpretTwoFactorVerify({ reached: false })).toEqual({
      kind: "transport-failure",
    });
  });
});
