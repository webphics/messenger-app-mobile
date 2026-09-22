import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { updateProfile } from "@/lib/profile-api";
import { getSessionUser, setSessionUser } from "@/lib/session";

/**
 * The bug this file exists for was invisible to every other test in the suite,
 * and it was invisible for a structural reason rather than a careless one:
 * nothing else holds all three copies of the signed-in person at once.
 *
 * There are three. The auth state a screen subscribes to, the module snapshot
 * `getSessionUser()` that most screens actually read, and the Kept person a
 * cold start with no signal resolves to. A profile write that updated only the
 * first left the Hub greeting somebody by the email address they had just
 * replaced with their name, until the app was restarted.
 *
 * `lib/session` is deliberately real here rather than mocked. It is pure, and
 * the assertion worth making is that the snapshot a screen would read has
 * actually moved — not that a function was called.
 */

jest.mock("@/lib/auth-service", () => ({ authenticatedRequest: jest.fn() }));
jest.mock("@/lib/keychain", () => ({ writeKeptPerson: jest.fn() }));

const request = authenticatedRequest as jest.MockedFunction<
  typeof authenticatedRequest
>;
const kept = writeKeptPerson as jest.MockedFunction<typeof writeKeptPerson>;

const NAMED = {
  id: "4",
  name: "Grace Hopper",
  email: "onboarding-probe@talo.test",
  role: "customer",
  hasPassword: true,
  twoFactorEnabled: false,
};

/** Who the device thought was signed in before the write: the nameless account. */
const BEFORE = {
  id: "4",
  // What `parseSessionUser` hands on for a blank name — the substitution that
  // hid the onboarding gate. The point here is that it is what the Hub drew.
  name: "onboarding-probe@talo.test",
  email: "onboarding-probe@talo.test",
  role: "customer" as const,
  hasPassword: true,
  twoFactorEnabled: false,
};

const answered = (data: unknown) => ({
  reached: true as const,
  status: 200,
  body: { data },
  sessionCookie: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  setSessionUser(BEFORE);
});

describe("what the API is asked", () => {
  test("a PUT carrying the name and the phone", async () => {
    request.mockResolvedValueOnce(answered(NAMED));

    await updateProfile({ name: "Grace Hopper", phone: null });

    expect(request).toHaveBeenCalledWith("/auth/profile", {
      method: "PUT",
      body: { name: "Grace Hopper", phone: null },
    });
  });

  test("`phone` is sent explicitly as null rather than omitted", async () => {
    // The route writes `input.phone ?? null` unconditionally, so a body with no
    // `phone` clears the stored number. Sending null is the same outcome said
    // out loud; sending nothing would be a silent write.
    request.mockResolvedValueOnce(answered(NAMED));

    await updateProfile({ name: "Grace Hopper", phone: null });

    const body = request.mock.calls[0]![1]!.body as Record<string, unknown>;
    expect("phone" in body).toBe(true);
    expect(body.phone).toBeNull();
  });

  test("a kept number is sent back rather than dropped", async () => {
    request.mockResolvedValueOnce(answered({ ...NAMED }));

    await updateProfile({ name: "Grace Hopper", phone: "+447700900000" });

    const body = request.mock.calls[0]![1]!.body as Record<string, unknown>;
    expect(body.phone).toBe("+447700900000");
  });
});

describe("the three copies of the signed-in person", () => {
  test("the snapshot a screen reads moves to the answer", async () => {
    request.mockResolvedValueOnce(answered(NAMED));

    await updateProfile({ name: "Grace Hopper", phone: null });

    expect(getSessionUser()?.name).toBe("Grace Hopper");
  });

  test("the Kept person moves with it, so a cold start agrees", async () => {
    request.mockResolvedValueOnce(answered(NAMED));

    await updateProfile({ name: "Grace Hopper", phone: null });

    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Grace Hopper" }),
    );
  });

  test("what lands is the server's answer, never the name that was asked for", async () => {
    // The API re-reads the session after the write. If it ever answers with
    // something other than what was sent — a trimmed name, a different casing —
    // that is what the person is, and it is what has to be stored.
    request.mockResolvedValueOnce(answered({ ...NAMED, name: "Grace H." }));

    await updateProfile({ name: "Grace Hopper", phone: null });

    expect(getSessionUser()?.name).toBe("Grace H.");
    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Grace H." }),
    );
  });
});

describe("a write that did not happen changes nothing", () => {
  test("a refusal leaves both copies exactly as they were", async () => {
    request.mockResolvedValueOnce({
      reached: true as const,
      status: 422,
      body: { message: "Name is required." },
      sessionCookie: null,
    });

    const result = await updateProfile({ name: "", phone: null });

    expect(result.ok).toBe(false);
    expect(getSessionUser()).toEqual(BEFORE);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a dead network leaves them too, and says so", async () => {
    request.mockResolvedValueOnce({ reached: false as const });

    const result = await updateProfile({ name: "Grace Hopper", phone: null });

    expect(result).toEqual({ ok: false, failure: { kind: "unreachable" } });
    expect(getSessionUser()).toEqual(BEFORE);
    expect(kept).not.toHaveBeenCalled();
  });

  test("an expired session is reported rather than written through", async () => {
    // Nobody is signed out by this module — the expiry listener in
    // `auth-service` owns that — but nothing may be stored against a session
    // the API has just refused.
    request.mockResolvedValueOnce({
      reached: true as const,
      status: 401,
      body: {},
      sessionCookie: null,
    });

    const result = await updateProfile({ name: "Grace Hopper", phone: null });

    expect(result).toEqual({ ok: false, failure: { kind: "unauthorised" } });
    expect(getSessionUser()).toEqual(BEFORE);
    expect(kept).not.toHaveBeenCalled();
  });

  test("a body this build cannot read is not stored as half a person", async () => {
    request.mockResolvedValueOnce(answered({ id: "4", name: "Grace Hopper" }));

    const result = await updateProfile({ name: "Grace Hopper", phone: null });

    expect(result).toEqual({ ok: false, failure: { kind: "malformed" } });
    expect(getSessionUser()).toEqual(BEFORE);
    expect(kept).not.toHaveBeenCalled();
  });
});
