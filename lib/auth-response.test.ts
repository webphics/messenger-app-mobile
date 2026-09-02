import {
  interpretSession,
  interpretSignIn,
  parseSessionUser,
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

describe("parseSessionUser", () => {
  test("reads the four fields this client acts on", () => {
    expect(parseSessionUser(apiUser())).toEqual({
      id: "ab05cfc4-5ee5-40fb-93af-564a773257e5",
      name: "Admin",
      email: "admin@talo.com",
      role: "admin",
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
      },
    });
  });

  test("a request that never got an answer is a transport failure", () => {
    expect(interpretSignIn({ reached: false })).toEqual({ kind: "transport-failure" });
  });

  test("a two-factor challenge is its own outcome, not a sign-in", () => {
    const challenge = envelope(
      { twoFactorRedirect: true, twoFactorMethods: ["totp"] },
      "Two-factor authentication required",
    );
    // The API returns the challenge as a 200 and deliberately sets no session cookie.
    expect(interpretSignIn(ok(challenge, null))).toEqual({ kind: "two-factor" });
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
