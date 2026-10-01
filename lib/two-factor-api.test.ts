import {
  adoptReplacedSessionCookie,
  authenticatedRequest,
} from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { getSessionUser, setSessionUser } from "@/lib/session";
import { disableTwoFactor, generateBackupCodes } from "@/lib/two-factor-api";

/**
 * Another write that changes who the signed-in person *is*, so the assertion
 * worth making is that every copy of them has moved (or none has), not that a
 * function was called. `lib/session` is deliberately real rather than mocked.
 */

jest.mock("@/lib/auth-service", () => ({
  authenticatedRequest: jest.fn(),
  adoptReplacedSessionCookie: jest.fn(),
  currentCredentialEpoch: jest.fn(() => 0),
}));
jest.mock("@/lib/keychain", () => ({ writeKeptPerson: jest.fn() }));

const request = authenticatedRequest as jest.MockedFunction<
  typeof authenticatedRequest
>;
const kept = writeKeptPerson as jest.MockedFunction<typeof writeKeptPerson>;
const adopt = adoptReplacedSessionCookie as jest.MockedFunction<
  typeof adoptReplacedSessionCookie
>;

/** Who the device thought was signed in: two-factor on, and a password. */
const PROTECTED_PERSON = {
  id: "7",
  name: "Ada Lovelace",
  email: "ada@joychat.test",
  role: "customer" as const,
  hasPassword: true,
  twoFactorEnabled: true,
  supportAssignmentEnabled: false,
  capabilities: [],
};

const answered = (data: unknown, status = 200) => ({
  reached: true as const,
  status,
  body: { data },
  sessionCookie: null,
});

const bodyOf = (call = 0) =>
  request.mock.calls[call]![1]!.body as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  setSessionUser(PROTECTED_PERSON);
});

describe("what the API is asked to turn two-factor off", () => {
  test("a POST to the disable route carrying the password", async () => {
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor("hunter2");

    expect(request).toHaveBeenCalledWith("/auth/two-factor/disable", {
      method: "POST",
      body: { password: "hunter2" },
    });
  });

  test("an account with no password sends an empty body rather than an empty password", async () => {
    // `{ password: "" }` is a present-but-empty password the API refuses.
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor(null);

    expect("password" in bodyOf()).toBe(false);
  });
});

describe("two-factor that was turned off", () => {
  test("the snapshot a screen reads now says the factor is off", async () => {
    request.mockResolvedValueOnce(answered({ status: true }));

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({
      ok: true,
      value: { ...PROTECTED_PERSON, twoFactorEnabled: false },
    });
    expect(getSessionUser()?.twoFactorEnabled).toBe(false);
  });

  test("the Kept person moves with it, so a cold start agrees", async () => {
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor("hunter2");

    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ id: "7", twoFactorEnabled: false }),
    );
  });

  test("the session the API replaced it with is the one held from now on", async () => {
    // Turning the factor off ends the session the request carried; keeping its
    // cookie signed the person out on their next request.
    const outcome = {
      ...answered({ status: true }),
      sessionCookie: "better-auth.session_token=successor",
    };
    request.mockResolvedValueOnce(outcome);

    await disableTwoFactor("hunter2");

    expect(adopt).toHaveBeenCalledWith(outcome, 0);
  });

  test("a `false` status is not a factor that was turned off", async () => {
    // Somebody must not be told their factor is off while it is on.
    request.mockResolvedValueOnce(answered({ status: false }));

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
  });

  test("a refused disable changes nothing", async () => {
    request.mockResolvedValueOnce({
      reached: true as const,
      status: 400,
      body: { message: "Invalid password." },
      sessionCookie: null,
    });

    const result = await disableTwoFactor("not-the-right-one");

    expect(result).toEqual({
      ok: false,
      failure: { kind: "refused", message: "Invalid password." },
    });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });
});

describe("codes that were generated", () => {
  test("the codes come back exactly as the API sent them", async () => {
    request.mockResolvedValueOnce(answered(["aaaa-1111", "bbbb-2222"], 201));

    expect(await generateBackupCodes("hunter2")).toEqual({
      ok: true,
      value: ["aaaa-1111", "bbbb-2222"],
    });
  });

  // Shown once and never readable again, so a half-read or empty set is
  // reported as malformed rather than shown with holes in it.
  test.each([
    ["an empty list", []],
    ["a list holding something that is not a string", ["aaaa-1111", 42]],
  ])("%s is malformed rather than shown", async (_name, data) => {
    request.mockResolvedValueOnce(answered(data, 201));

    expect(await generateBackupCodes("hunter2")).toEqual({
      ok: false,
      failure: { kind: "malformed" },
    });
  });
});
