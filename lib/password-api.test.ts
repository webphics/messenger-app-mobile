import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { changePassword, setPassword } from "@/lib/password-api";
import { getSessionUser, setSessionUser } from "@/lib/session";

/**
 * `lib/profile-api.test.ts` is the model, and for the reason that file gives:
 * this is the other write that changes who the signed-in person *is*, so the
 * assertion worth making is that every copy of them has moved, not that a
 * function was called.
 *
 * What is different here is where the new value comes from. `change-password`
 * answers with the re-read session user, exactly as the profile write does.
 * `set-password` answers a bare `true`, so the updated person is derived from
 * the one already held, which is the one thing in this module that is not read
 * off a payload, and the reason both halves are tested separately rather than
 * as one table.
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

/** Who the device thought was signed in: an account with no password. */
const WITHOUT_PASSWORD = {
  id: "7",
  name: "Ada Lovelace",
  email: "ada@chatroute.test",
  role: "customer" as const,
  hasPassword: false,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
};

const WITH_PASSWORD = { ...WITHOUT_PASSWORD, hasPassword: true };

const answered = (data: unknown) => ({
  reached: true as const,
  status: 200,
  body: { data },
  sessionCookie: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  setSessionUser(WITHOUT_PASSWORD);
});

describe("what the API is asked for a first password", () => {
  test("a POST to set-password carrying the new password alone", async () => {
    request.mockResolvedValueOnce(answered(true));

    await setPassword("a-brand-new-one");

    expect(request).toHaveBeenCalledWith("/auth/set-password", {
      method: "POST",
      body: { newPassword: "a-brand-new-one" },
    });
  });
});

describe("what the API is asked for a change", () => {
  test("a POST to change-password carrying both passwords", async () => {
    request.mockResolvedValueOnce(answered(WITH_PASSWORD));

    await changePassword({
      currentPassword: "the-old-one",
      newPassword: "the-new-one",
    });

    expect(request).toHaveBeenCalledWith("/auth/change-password", {
      method: "POST",
      body: { currentPassword: "the-old-one", newPassword: "the-new-one" },
    });
  });
});

describe("a password that was set", () => {
  test("the snapshot a screen reads now says the account has one", async () => {
    request.mockResolvedValueOnce(answered(true));

    const result = await setPassword("a-brand-new-one");

    expect(result).toEqual({ ok: true, value: WITH_PASSWORD });
    expect(getSessionUser()?.hasPassword).toBe(true);
  });

  test("the Kept person moves with it, so a cold start agrees", async () => {
    request.mockResolvedValueOnce(answered(true));

    await setPassword("a-brand-new-one");

    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ id: "7", hasPassword: true }),
    );
  });

  test("a `false` status is not a password that was set", async () => {
    // Better Auth answers `{ status }` and the API passes the boolean through.
    // Anything but `true` is an answer this client cannot turn into a set
    // password, so nothing is written on the strength of it.
    request.mockResolvedValueOnce(answered(false));

    const result = await setPassword("a-brand-new-one");

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(WITHOUT_PASSWORD);
    expect(kept).not.toHaveBeenCalled();
  });
});

describe("a password that was changed", () => {
  test("what lands is the server's answer, never the input", async () => {
    // `change-password` answers with the re-read session user, so a name or a
    // role that moved server-side lands here too.
    request.mockResolvedValueOnce(
      answered({ ...WITH_PASSWORD, name: "Ada L." }),
    );

    const result = await changePassword({
      currentPassword: "the-old-one",
      newPassword: "the-new-one",
    });

    expect(result.ok).toBe(true);
    expect(getSessionUser()?.name).toBe("Ada L.");
    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ada L.", hasPassword: true }),
    );
  });
});

describe("a write that did not happen changes nothing", () => {
  const refused = {
    reached: true as const,
    status: 400,
    body: { message: "Current password is incorrect." },
    sessionCookie: null,
  };

  test("a refused change reports the server's own words", async () => {
    request.mockResolvedValueOnce(refused);

    const result = await changePassword({
      currentPassword: "not-the-old-one",
      newPassword: "the-new-one",
    });

    expect(result).toEqual({
      ok: false,
      failure: { kind: "refused", message: "Current password is incorrect." },
    });
    expect(getSessionUser()).toEqual(WITHOUT_PASSWORD);
    expect(kept).not.toHaveBeenCalled();
  });

  test("an expired session is reported rather than written through", async () => {
    // Nobody is signed out by this module, because the expiry listener in
    // `auth-service` owns that, but nothing may be stored against a session
    // the API has just refused.
    request.mockResolvedValueOnce({
      reached: true as const,
      status: 401,
      body: {},
      sessionCookie: null,
    });

    const result = await changePassword({
      currentPassword: "the-old-one",
      newPassword: "the-new-one",
    });

    expect(result).toEqual({ ok: false, failure: { kind: "unauthorised" } });
    expect(getSessionUser()).toEqual(WITHOUT_PASSWORD);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a body this build cannot read is not stored as half a person", async () => {
    request.mockResolvedValueOnce(answered({ id: "7", name: "Ada Lovelace" }));

    const result = await changePassword({
      currentPassword: "the-old-one",
      newPassword: "the-new-one",
    });

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(WITHOUT_PASSWORD);
    expect(kept).not.toHaveBeenCalled();
  });
});
