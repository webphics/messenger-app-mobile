import { adoptReplacedSessionCookie, authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { removeProfilePhoto, updateProfile, uploadProfilePhoto } from "@/lib/profile-api";
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

const NAMED = {
  id: "4",
  name: "Grace Hopper",
  email: "onboarding-probe@talo.test",
  role: "customer",
  hasPassword: true,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
  username: null,
  phone: null,
  image: null,
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
  supportAssignmentEnabled: false,
  capabilities: [],
  username: null,
  phone: null,
  image: null,
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

  test("a username rides along only when one is given, since absent keeps the current one", async () => {
    request.mockResolvedValueOnce(answered(NAMED));

    await updateProfile({ name: "Grace Hopper", username: "grace", phone: "+14155552671" });

    expect(request).toHaveBeenCalledWith("/auth/profile", {
      method: "PUT",
      body: { name: "Grace Hopper", username: "grace", phone: "+14155552671" },
    });
  });

  test("a new photo is the picked file, posted to the avatar route", async () => {
    request.mockResolvedValueOnce(answered(NAMED));
    const file = { uri: "file:///me.jpg", field: "file", type: "image/jpeg" };

    await uploadProfilePhoto(file);

    expect(request).toHaveBeenCalledWith("/auth/profile/avatar", { method: "POST", file });
  });

  test("removing the photo is a DELETE on the same route, with no body", async () => {
    request.mockResolvedValueOnce(answered(NAMED));

    await removeProfilePhoto();

    expect(request).toHaveBeenCalledWith("/auth/profile/avatar", { method: "DELETE" });
  });
});

describe("the three copies of the signed-in person", () => {
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

  test.each([
    ["a new photo", () => uploadProfilePhoto({ uri: "file:///me.jpg", field: "file", type: "image/jpeg" })],
    ["a removed photo", () => removeProfilePhoto()],
  ])("%s lands in every copy, so the Settings header redraws at once", async (_label, write) => {
    request.mockResolvedValueOnce(answered({ ...NAMED, image: "/uploads/avatars/new.jpg" }));

    await write();

    expect(getSessionUser()?.image).toBe("/uploads/avatars/new.jpg");
    expect(kept).toHaveBeenCalledWith(
      expect.objectContaining({ image: "/uploads/avatars/new.jpg" }),
    );
  });

  test("the re-issued Session cookie is kept, as the API asks of a native client", async () => {
    const outcome = { ...answered(NAMED), sessionCookie: "better-auth.session_token=next" };
    request.mockResolvedValueOnce(outcome);

    await updateProfile({ name: "Grace Hopper", phone: null });

    expect(adopt).toHaveBeenCalledWith(outcome, 0);
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
    expect(adopt).not.toHaveBeenCalled();
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
