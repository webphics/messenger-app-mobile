import type { HttpOutcome } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";
import {
  readResetRequest,
  requestPasswordReset,
  resetRequestNotice,
  type ResetRequestOutcome,
} from "@/lib/password-reset-api";

/**
 * The request is one line, so most of this is the two tables: what an answer
 * reads as, and what the screen says about each reading. The rate limit gets
 * rows of its own, because it is keyed on the status rather than the code and a
 * code-shaped test would pass for the wrong reason.
 */

jest.mock("@/lib/auth-service", () => ({ authenticatedRequest: jest.fn() }));

const request = authenticatedRequest as jest.MockedFunction<typeof authenticatedRequest>;

const answered = (status: number, body: unknown): HttpOutcome => ({
  reached: true,
  status,
  body,
  sessionCookie: null,
});

const unreachable: HttpOutcome = { reached: false };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("what the API is asked", () => {
  test("a POST to password/forgot carrying the trimmed address alone", async () => {
    request.mockResolvedValueOnce(answered(200, { data: { sent: true } }));

    await expect(requestPasswordReset("  ada@chatroute.test ")).resolves.toEqual({
      kind: "sent",
    });

    expect(request).toHaveBeenCalledWith("/auth/password/forgot", {
      method: "POST",
      body: { email: "ada@chatroute.test" },
    });
  });
});

describe("readResetRequest", () => {
  test.each<[string, HttpOutcome, ResetRequestOutcome]>([
    ["sent", answered(200, { data: { sent: true } }), { kind: "sent" }],
    [
      "sent: false is not a sent email",
      answered(200, { data: { sent: false } }),
      { kind: "failed", failure: { kind: "malformed" } },
    ],
    [
      "a payload with no sent field",
      answered(200, { data: true }),
      { kind: "failed", failure: { kind: "malformed" } },
    ],
    [
      "a body that is not an envelope",
      answered(200, null),
      { kind: "failed", failure: { kind: "malformed" } },
    ],
    [
      "rate-limited, with the API's retryAfter",
      answered(429, { code: "rate_limit_exceeded", message: "Slow down.", meta: { retryAfter: 125 } }),
      { kind: "rate-limited", retryAfterSeconds: 125 },
    ],
    [
      "rate-limited under a code this client has never seen",
      answered(429, { code: "some_new_code", message: "Slow down." }),
      { kind: "rate-limited", retryAfterSeconds: null },
    ],
    [
      "rate-limited, retryAfter that is not a usable number",
      answered(429, { meta: { retryAfter: "soon" } }),
      { kind: "rate-limited", retryAfterSeconds: null },
    ],
    [
      "rate-limited with no body at all",
      answered(429, null),
      { kind: "rate-limited", retryAfterSeconds: null },
    ],
    [
      "a refusal in the API's own words",
      answered(422, { code: "validation_failed", message: "Email is required." }),
      { kind: "failed", failure: { kind: "refused", message: "Email is required.", code: "validation_failed" } },
    ],
    ["an expired session", answered(401, {}), { kind: "failed", failure: { kind: "unauthorised" } }],
    ["no connection", unreachable, { kind: "failed", failure: { kind: "unreachable" } }],
  ])("%s", (_name, outcome, expected) => {
    expect(readResetRequest(outcome)).toEqual(expected);
  });
});

describe("resetRequestNotice", () => {
  const email = " ada@chatroute.test ";

  test.each<[string, ResetRequestOutcome, string | null]>([
    [
      "sent names the address and the browser",
      { kind: "sent" },
      "A link to set a new password is on its way to ada@chatroute.test. Open it on this phone or a computer, and set the new password in your browser. The link works once and expires after an hour.",
    ],
    [
      "rate-limited, rounded up to whole minutes",
      { kind: "rate-limited", retryAfterSeconds: 125 },
      "Too many reset emails have been asked for. Try again in 3 minutes.",
    ],
    [
      "rate-limited, under a minute",
      { kind: "rate-limited", retryAfterSeconds: 20 },
      "Too many reset emails have been asked for. Try again in 1 minute.",
    ],
    [
      "rate-limited, with no wait given",
      { kind: "rate-limited", retryAfterSeconds: null },
      "Too many reset emails have been asked for. Wait a few minutes, then try again.",
    ],
    [
      "no connection",
      { kind: "failed", failure: { kind: "unreachable" } },
      "Could not reach the server, so no email was sent. Check your connection and try again.",
    ],
    [
      "a refusal speaks in the API's words",
      { kind: "failed", failure: { kind: "refused", message: "Email is required." } },
      "Email is required.",
    ],
    [
      "an unreadable answer",
      { kind: "failed", failure: { kind: "malformed" } },
      "The server answered with something this app did not understand. A reset email may not have been sent.",
    ],
    ["an expired session says nothing", { kind: "failed", failure: { kind: "unauthorised" } }, null],
  ])("%s", (_name, outcome, expected) => {
    expect(resetRequestNotice(outcome, email)).toBe(expected);
  });

  test("an address typed on sign-in is answered with an if, so it says nothing about the account", () => {
    expect(resetRequestNotice({ kind: "sent" }, email, "typed")).toBe(
      "If ada@chatroute.test has an account, a link to set a new password is on its way. Open it on this phone or a computer, and set the new password in your browser. The link works once and expires after an hour.",
    );
  });

  test("everything but a sent link reads the same on sign-in", () => {
    const limited: ResetRequestOutcome = { kind: "rate-limited", retryAfterSeconds: 125 };
    expect(resetRequestNotice(limited, email, "typed")).toBe(resetRequestNotice(limited, email));
  });
});
