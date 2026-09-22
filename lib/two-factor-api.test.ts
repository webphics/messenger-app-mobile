import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { getSessionUser, setSessionUser } from "@/lib/session";
import { disableTwoFactor, generateBackupCodes } from "@/lib/two-factor-api";

/**
 * `lib/password-api.test.ts` is the model, and for the reason that file gives:
 * this is another write that changes who the signed-in person *is*, so the
 * assertion worth making is that every copy of them has moved, not that a
 * function was called.
 *
 * Two things here are not in that file. The disable answer carries a status
 * rather than a person, so the updated person is derived from the held one and a
 * `false` status has to be refused rather than read as a success. And the backup
 * codes are the one payload in this app that cannot be re-read: they arrive
 * once, so a set this client cannot read whole is reported as malformed rather
 * than shown with holes in it.
 *
 * `lib/session` is deliberately real rather than mocked. It is pure, and the
 * point is that the snapshot a screen would read has actually moved.
 */

jest.mock("@/lib/auth-service", () => ({ authenticatedRequest: jest.fn() }));
jest.mock("@/lib/keychain", () => ({ writeKeptPerson: jest.fn() }));

const request = authenticatedRequest as jest.MockedFunction<
  typeof authenticatedRequest
>;
const kept = writeKeptPerson as jest.MockedFunction<typeof writeKeptPerson>;

/** Who the device thought was signed in: two-factor on, and a password. */
const PROTECTED_PERSON = {
  id: "7",
  name: "Ada Lovelace",
  email: "ada@joychat.test",
  role: "customer" as const,
  hasPassword: true,
  twoFactorEnabled: true,
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

  test("and nothing else, because the body is a strict object", async () => {
    // `TwoFactorEnableInputSchema` is a `z.strictObject`, so an extra key is
    // refused outright rather than ignored.
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor("hunter2");

    expect(Object.keys(bodyOf())).toEqual(["password"]);
  });

  test("an account with no password sends an empty body rather than an empty password", async () => {
    // With `allowPasswordless: true` the API requires a password exactly when
    // the account has one, and `{ password: "" }` is a present-but-empty
    // password it refuses. The absence is expressed by omitting the key.
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor(null);

    expect(Object.keys(bodyOf())).toEqual([]);
    expect("password" in bodyOf()).toBe(false);
  });
});

describe("what the API is asked for fresh backup codes", () => {
  test("a POST to the generate route carrying the password", async () => {
    request.mockResolvedValueOnce(answered(["aaaa-1111"], 201));

    await generateBackupCodes("hunter2");

    expect(request).toHaveBeenCalledWith(
      "/auth/two-factor/generate-backup-codes",
      { method: "POST", body: { password: "hunter2" } },
    );
  });

  test("and an empty body where the account has no password", async () => {
    request.mockResolvedValueOnce(answered(["aaaa-1111"], 201));

    await generateBackupCodes(null);

    expect(Object.keys(bodyOf())).toEqual([]);
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

    expect(kept).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ id: "7", twoFactorEnabled: false }),
    );
  });

  test("nothing else about the person is invented", async () => {
    // The flag is the only thing this route's answer says anything about, and
    // the rest of the person is carried across untouched rather than re-read.
    request.mockResolvedValueOnce(answered({ status: true }));

    await disableTwoFactor("hunter2");

    expect(getSessionUser()).toEqual({
      ...PROTECTED_PERSON,
      twoFactorEnabled: false,
    });
  });

  test("the updated person is returned, so the caller can move the auth state", async () => {
    // The third copy of the signed-in person is the auth state, which no module
    // can reach. The screen passes this value to `accountUpdated`, and without
    // it the Settings row goes on reporting a factor that is off as on.
    request.mockResolvedValueOnce(answered({ status: true }));

    const result = await disableTwoFactor("hunter2");

    expect(result.ok && result.value.twoFactorEnabled).toBe(false);
  });

  test("a `false` status is not a factor that was turned off", async () => {
    // Better Auth answers `{ status }` and the API passes the boolean through.
    // Anything but `true` is the server declining to claim it disabled
    // anything, and somebody must not be told their factor is off while it is
    // on.
    request.mockResolvedValueOnce(answered({ status: false }));

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });
});

describe("codes that were generated", () => {
  test("the codes come back exactly as the API sent them", async () => {
    request.mockResolvedValueOnce(answered(["aaaa-1111", "bbbb-2222"], 201));

    const result = await generateBackupCodes("hunter2");

    expect(result).toEqual({ ok: true, value: ["aaaa-1111", "bbbb-2222"] });
  });

  test("and nothing about the signed-in person is written", async () => {
    // Two-factor is on before this and on after it, and the codes themselves
    // are never stored on the device.
    request.mockResolvedValueOnce(answered(["aaaa-1111"], 201));

    await generateBackupCodes("hunter2");

    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a 201 is a success, since this route carries no `@HttpCode`", async () => {
    request.mockResolvedValueOnce(answered(["aaaa-1111"], 201));

    expect((await generateBackupCodes(null)).ok).toBe(true);
  });
});

describe("a set of codes this client cannot read whole", () => {
  // Stricter than the usual list parse, which drops rows it cannot read and
  // keeps the rest. These are shown once and no route reads them back, so a
  // half-read set is a recovery path with holes nobody can see, and an empty one
  // is a person handed nothing under a heading promising codes.
  test.each([
    ["a payload that is not a list", { codes: ["aaaa-1111"] }],
    ["an empty list", []],
    ["a list holding something that is not a string", ["aaaa-1111", 42]],
    ["a list holding an empty string", ["aaaa-1111", ""]],
    ["a list holding nothing but spaces", ["aaaa-1111", "   "]],
    ["null", null],
  ])("%s is malformed rather than shown", async (_name, data) => {
    request.mockResolvedValueOnce(answered(data, 201));

    expect(await generateBackupCodes("hunter2")).toEqual({
      ok: false,
      failure: { kind: "malformed" },
    });
  });
});

describe("an action that did not happen changes nothing", () => {
  const refused = {
    reached: true as const,
    status: 400,
    body: { message: "Invalid password." },
    sessionCookie: null,
  };

  test("a refused disable reports the server's own words", async () => {
    request.mockResolvedValueOnce(refused);

    const result = await disableTwoFactor("not-the-right-one");

    expect(result).toEqual({
      ok: false,
      failure: { kind: "refused", message: "Invalid password." },
    });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a refused generate says so and hands back no codes", async () => {
    request.mockResolvedValueOnce(refused);

    const result = await generateBackupCodes("not-the-right-one");

    expect(result).toEqual({
      ok: false,
      failure: { kind: "refused", message: "Invalid password." },
    });
  });

  test("a dead network leaves the person alone, and says so", async () => {
    request.mockResolvedValueOnce({ reached: false as const });

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "unreachable" } });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a dead network over a generate is the same answer", async () => {
    request.mockResolvedValueOnce({ reached: false as const });

    expect(await generateBackupCodes(null)).toEqual({
      ok: false,
      failure: { kind: "unreachable" },
    });
  });

  test("an expired session is reported rather than written through", async () => {
    // Nobody is signed out by this module, the expiry listener in
    // `auth-service` owns that, but nothing may be stored against a session the
    // API has just refused.
    request.mockResolvedValueOnce({
      reached: true as const,
      status: 401,
      body: {},
      sessionCookie: null,
    });

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "unauthorised" } });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a disable body this build cannot read is not written through", async () => {
    request.mockResolvedValueOnce(answered({ disabled: true }));

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(PROTECTED_PERSON);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a disable with nobody held is reported rather than guessed at", async () => {
    // Unreachable in practice: a 200 from a guarded route means there was a
    // session, and a session means a held person. It is here because the
    // derivation has nothing to derive from, and inventing one would write a
    // stranger into the keystore.
    setSessionUser(null);
    request.mockResolvedValueOnce(answered({ status: true }));

    const result = await disableTwoFactor("hunter2");

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(kept).not.toHaveBeenCalled();
  });
});
