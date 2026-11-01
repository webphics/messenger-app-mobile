import {
  adoptReplacedSessionCookie,
  authenticatedRequest,
} from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { apiRequest } from "@/lib/api-client";
import { CODE_REFUSED_NOTICE } from "@/lib/auth-response";
import { getSessionUser, setSessionUser } from "@/lib/session";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  generateBackupCodes,
  startTwoFactorSetup,
} from "@/lib/two-factor-api";

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
jest.mock("@/lib/api-client", () => ({ apiRequest: jest.fn() }));

const request = authenticatedRequest as jest.MockedFunction<
  typeof authenticatedRequest
>;
const plainRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const kept = writeKeptPerson as jest.MockedFunction<typeof writeKeptPerson>;
const adopt = adoptReplacedSessionCookie as jest.MockedFunction<
  typeof adoptReplacedSessionCookie
>;

/** Who the device thought was signed in: two-factor on, and a password. */
const PROTECTED_PERSON = {
  id: "7",
  name: "Ada Lovelace",
  email: "ada@chatroute.test",
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

const TOTP_URI =
  "otpauth://totp/ChatRoute:ada%40chatroute.test?secret=JMYXUODFHBIF6X2R&issuer=ChatRoute&digits=6&period=30";
const SETUP_CODES = ["d4m39-TKO73", "1vfhC-17O0S"];

describe("starting a setup", () => {
  test("asks the enable route, with the same body rule as disable", async () => {
    request.mockResolvedValueOnce(
      answered({ totpURI: TOTP_URI, backupCodes: SETUP_CODES }, 201),
    );

    const result = await startTwoFactorSetup("hunter2");

    expect(request).toHaveBeenCalledWith("/auth/two-factor/enable", {
      method: "POST",
      body: { password: "hunter2" },
    });
    expect(result).toEqual({
      ok: true,
      value: { totpURI: TOTP_URI, secret: "JMYXUODFHBIF6X2R", backupCodes: SETUP_CODES },
    });
  });

  test("turns nothing on, so nobody is told they are protected yet", async () => {
    // better-auth flips `twoFactorEnabled` only when the first code is verified.
    request.mockResolvedValueOnce(
      answered({ totpURI: TOTP_URI, backupCodes: SETUP_CODES }, 201),
    );
    setSessionUser({ ...PROTECTED_PERSON, twoFactorEnabled: false });

    await startTwoFactorSetup("hunter2");

    expect(getSessionUser()?.twoFactorEnabled).toBe(false);
    expect(kept).not.toHaveBeenCalled();
  });

  test.each([
    ["a link with no secret", { totpURI: "otpauth://totp/ChatRoute:ada", backupCodes: SETUP_CODES }],
    ["no backup codes", { totpURI: TOTP_URI, backupCodes: [] }],
  ])("%s is malformed rather than half a setup", async (_name, data) => {
    request.mockResolvedValueOnce(answered(data, 201));

    expect(await startTwoFactorSetup("hunter2")).toEqual({
      ok: false,
      failure: { kind: "malformed" },
    });
  });
});

describe("confirming a setup", () => {
  const OFF = { ...PROTECTED_PERSON, twoFactorEnabled: false };
  const apiUser = { id: "7", email: "ada@chatroute.test", role: "customer", twoFactorEnabled: true };

  beforeEach(() => {
    setSessionUser(OFF);
  });

  test("a wrong code is a refusal about the code, and never reaches the session-ending path", async () => {
    // Through `authenticatedRequest` this 401 would sign the person out.
    plainRequest.mockResolvedValueOnce({
      reached: true as const,
      status: 401,
      body: { code: "invalid_credentials", message: "Invalid username, email, or password." },
      sessionCookie: null,
    });

    const result = await confirmTwoFactorSetup("000 000");

    expect(plainRequest).toHaveBeenCalledWith("/auth/two-factor/verify-totp", {
      method: "POST",
      body: { code: "000000" },
    });
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, failure: { kind: "refused", message: CODE_REFUSED_NOTICE } });
    expect(getSessionUser()).toEqual(OFF);
  });

  test("an accepted code turns it on everywhere, under the session the API replaced", async () => {
    const outcome = {
      ...answered(apiUser, 201),
      sessionCookie: "better-auth.session_token=successor",
    };
    plainRequest.mockResolvedValueOnce(outcome);

    const result = await confirmTwoFactorSetup("123456");

    expect(result).toEqual({ ok: true, value: { ...OFF, twoFactorEnabled: true } });
    expect(adopt).toHaveBeenCalledWith(outcome, 0);
    expect(getSessionUser()?.twoFactorEnabled).toBe(true);
    expect(kept).toHaveBeenCalledWith(expect.objectContaining({ twoFactorEnabled: true }));
  });

  test("an answer that does not say the factor is on is not believed", async () => {
    plainRequest.mockResolvedValueOnce(answered({ ...apiUser, twoFactorEnabled: false }, 201));

    expect(await confirmTwoFactorSetup("123456")).toEqual({
      ok: false,
      failure: { kind: "malformed" },
    });
    expect(getSessionUser()).toEqual(OFF);
    expect(adopt).not.toHaveBeenCalled();
  });
});
