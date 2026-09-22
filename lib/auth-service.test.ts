import {
  apiRequest,
  clearCsrfPair,
  getSessionCookie,
  setSessionCookie,
} from "@/lib/api-client";
import {
  authenticatedRequest,
  confirmSession,
  hydrateAuth,
  onSessionExpired,
  requestMagicLink,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  verifyMagicLink,
} from "@/lib/auth-service";
import { releaseGoogleSession, requestGoogleIdToken } from "@/lib/google-session";
import {
  clearKeptPerson,
  clearRetiredCredential,
  clearSessionCookie,
  readKeptPerson,
  readSessionCookie,
  writeKeptPerson,
  writeSessionCookie,
} from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import { pushDeregistrationSettled } from "@/lib/push-registry";
import { getSessionUser, setSessionUser } from "@/lib/session";
import { endSessionOnDevice } from "@/lib/session-wipe";

jest.mock("@/lib/api-client", () => {
  let held: string | null = null;
  return {
    apiRequest: jest.fn(),
    setSessionCookie: jest.fn((cookie: string | null) => {
      held = cookie;
    }),
    getSessionCookie: jest.fn(() => held),
    clearCsrfPair: jest.fn(),
  };
});

jest.mock("@/lib/legacy-session", () => ({
  purgeMockSession: jest.fn(async () => undefined),
}));

// The origin is read from `.env` or the app's own scheme, and Jest has neither.
// Pinned to an HTTPS origin so the assertions below are about what travels with
// the request rather than about which build produced it. The build that has no
// origin at all is a whole-module condition, so it gets its own file:
// `lib/auth-service-unconfigured.test.ts`.
jest.mock("@/lib/magic-link-config", () => ({
  ...jest.requireActual("@/lib/magic-link-config"),
  MAGIC_LINK_ORIGIN: "https://app.example.com",
}));

// The one boundary here that cannot run under Jest at all: the native module's
// `TurboModuleRegistry.getEnforcing` throws at import when there is no native
// side. Everything this feature actually decides is pure and tested in
// `lib/google-auth.test.ts`; what is mocked away is the account sheet.
jest.mock("@/lib/google-session", () => ({
  requestGoogleIdToken: jest.fn(async () => ({ kind: "failed" })),
  releaseGoogleSession: jest.fn(async () => undefined),
}));

// The Store and the downloaded documents both sit behind native modules, and
// what they do with a wipe is tested where each of them owns one. What matters
// here is only which moments reach this at all.
jest.mock("@/lib/session-wipe", () => ({
  endSessionOnDevice: jest.fn(async () => undefined),
}));

// The `DELETE` the wipe fires needs the same cookie the logout is about to
// invalidate, so signing out waits for it. What it does is `lib/push-registry`'s
// to say; that it is waited for is this file's.
jest.mock("@/lib/push-registry", () => ({
  pushDeregistrationSettled: jest.fn(async () => undefined),
}));

jest.mock("@/lib/keychain", () => ({
  readSessionCookie: jest.fn(),
  writeSessionCookie: jest.fn(async () => true),
  clearSessionCookie: jest.fn(async () => true),
  clearRetiredCredential: jest.fn(async () => undefined),
  readKeptPerson: jest.fn(async () => null),
  writeKeptPerson: jest.fn(async () => undefined),
  clearKeptPerson: jest.fn(async () => undefined),
}));

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
const googleToken = requestGoogleIdToken as jest.MockedFunction<
  typeof requestGoogleIdToken
>;
const releaseGoogle = releaseGoogleSession as jest.MockedFunction<
  typeof releaseGoogleSession
>;
const readCookie = readSessionCookie as jest.MockedFunction<typeof readSessionCookie>;
const writeCookie = writeSessionCookie as jest.MockedFunction<typeof writeSessionCookie>;
const clearCookie = clearSessionCookie as jest.MockedFunction<typeof clearSessionCookie>;
const wipe = endSessionOnDevice as jest.MockedFunction<typeof endSessionOnDevice>;
const deregistered = pushDeregistrationSettled as jest.MockedFunction<
  typeof pushDeregistrationSettled
>;
const readPerson = readKeptPerson as jest.MockedFunction<typeof readKeptPerson>;
const writePerson = writeKeptPerson as jest.MockedFunction<typeof writeKeptPerson>;
const clearPerson = clearKeptPerson as jest.MockedFunction<typeof clearKeptPerson>;

const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.google-minted.signature";

const STORED = "better-auth.session_token=stored";
const ISSUED = "better-auth.session_token=issued";

const USER = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  publicId: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  hasPassword: true,
  twoFactorEnabled: false,
};

const PARSED_USER = {
  id: USER.id,
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent" as const,
  hasPassword: true,
  twoFactorEnabled: false,
};

function ok(data: unknown, sessionCookie: string | null = null) {
  return { reached: true as const, status: 200, body: { data }, sessionCookie };
}

beforeEach(() => {
  jest.clearAllMocks();
  setSessionCookie(null);
  setSessionUser(null);
  writeCookie.mockResolvedValue(true);
  clearCookie.mockResolvedValue(true);
  wipe.mockResolvedValue(undefined);
  readPerson.mockResolvedValue(null);
  writePerson.mockResolvedValue(undefined);
  clearPerson.mockResolvedValue(undefined);
});

describe("hydrateAuth", () => {
  test("sweeps up what earlier slices stored on the way past", async () => {
    readCookie.mockResolvedValueOnce(null);
    await hydrateAuth();
    expect(purgeMockSession).toHaveBeenCalled();
    expect(clearRetiredCredential).toHaveBeenCalled();
  });

  test("no stored cookie means nothing to check", async () => {
    readCookie.mockResolvedValueOnce(null);
    await expect(hydrateAuth()).resolves.toEqual({ outcome: null, kept: null });
    expect(request).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
  });

  test("a person kept with no cookie is leftovers, and is swept up rather than carried", async () => {
    readCookie.mockResolvedValueOnce(null);
    readPerson.mockResolvedValueOnce(PARSED_USER);

    // Nobody signs in off a name. The cookie is the credential; this is who it
    // said the credential belonged to.
    await expect(hydrateAuth()).resolves.toEqual({ outcome: null, kept: null });
    expect(clearPerson).toHaveBeenCalled();
    expect(getSessionUser()).toBeNull();
  });

  test("a live cookie signs its owner in and is held for later requests", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockResolvedValueOnce(ok(USER));

    await expect(hydrateAuth()).resolves.toEqual({
      outcome: { kind: "signed-in", cookie: STORED, user: PARSED_USER },
      kept: null,
    });
    expect(request).toHaveBeenCalledWith("/auth/session");
    expect(getSessionCookie()).toBe(STORED);
    expect(getSessionUser()).toEqual(PARSED_USER);
    // Beside the cookie, so the next cold start has somebody to answer with.
    expect(writePerson).toHaveBeenCalledWith(PARSED_USER);
  });

  test("the credential is held before the request, so it is the one presented", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockImplementationOnce(async () => {
      expect(getSessionCookie()).toBe(STORED);
      return ok(USER);
    });
    await hydrateAuth();
    expect.assertions(1);
  });

  test("a rejected cookie is erased from the keychain", async () => {
    readCookie.mockResolvedValueOnce("better-auth.session_token=stale");
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    await expect(hydrateAuth()).resolves.toMatchObject({
      outcome: { kind: "unauthorised" },
    });
    expect(clearCookie).toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a rejected cookie takes the kept person with it — an expiry is not a dead network", async () => {
    readCookie.mockResolvedValueOnce("better-auth.session_token=stale");
    readPerson.mockResolvedValueOnce(PARSED_USER);
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    await hydrateAuth();
    expect(clearPerson).toHaveBeenCalled();
    expect(getSessionUser()).toBeNull();
  });

  test("an unreachable API keeps the cookie rather than signing anyone out", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockResolvedValueOnce({ reached: false });

    await expect(hydrateAuth()).resolves.toEqual({
      outcome: { kind: "transport-failure" },
      kept: null,
    });
    expect(clearCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBe(STORED);
  });

  test("an unreachable API with a kept person hands that person back, and holds them", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    readPerson.mockResolvedValueOnce(PARSED_USER);
    request.mockResolvedValueOnce({ reached: false });

    await expect(hydrateAuth()).resolves.toEqual({
      outcome: { kind: "transport-failure" },
      kept: PARSED_USER,
    });
    // The mirror `getSession()` reads, so a screen drawn off a Stale session
    // names the same person the state machine put in it.
    expect(getSessionUser()).toEqual(PARSED_USER);
    expect(clearCookie).not.toHaveBeenCalled();
    expect(clearPerson).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBe(STORED);
  });

  test("a server error keeps the kept person too — the cookie is kept either way", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    readPerson.mockResolvedValueOnce(PARSED_USER);
    request.mockResolvedValueOnce({
      reached: true,
      status: 503,
      body: { message: "Service unavailable" },
      sessionCookie: null,
    });

    await expect(hydrateAuth()).resolves.toMatchObject({ kept: PARSED_USER });
    expect(clearPerson).not.toHaveBeenCalled();
    expect(getSessionUser()).toEqual(PARSED_USER);
  });
});

describe("confirmSession", () => {
  test("asks the session endpoint with the cookie already held", async () => {
    setSessionCookie(STORED);
    request.mockResolvedValueOnce(ok(USER));

    await expect(confirmSession()).resolves.toEqual({
      kind: "signed-in",
      cookie: STORED,
      user: PARSED_USER,
    });
    expect(request).toHaveBeenCalledWith("/auth/session", {});
  });

  test("a confirmed session replaces what the device was holding", async () => {
    setSessionCookie(STORED);
    setSessionUser({ ...PARSED_USER, role: "customer" });
    request.mockResolvedValueOnce(ok(USER));

    await confirmSession();
    // The role is the server's, even when this device had been drawing another
    // one for the last few seconds.
    expect(getSessionUser()).toEqual(PARSED_USER);
    expect(writePerson).toHaveBeenCalledWith(PARSED_USER);
  });

  test("a 401 is an ordinary Session expiry, announced once", async () => {
    setSessionCookie(STORED);
    const listener = jest.fn();
    const stop = onSessionExpired(listener);
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    // Nothing to report back: by the time this returns, the session has already
    // ended around it.
    await expect(confirmSession()).resolves.toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clearCookie).toHaveBeenCalled();
    expect(clearPerson).toHaveBeenCalled();
    expect(wipe).toHaveBeenCalled();
    stop();
  });

  test("a dead network leaves the Stale session exactly as it was", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce({ reached: false });

    await expect(confirmSession()).resolves.toEqual({ kind: "transport-failure" });
    expect(clearCookie).not.toHaveBeenCalled();
    expect(clearPerson).not.toHaveBeenCalled();
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("nothing to confirm without a held cookie", async () => {
    await expect(confirmSession()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("signInWithPassword", () => {
  test("posts the credentials and stores what comes back", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));

    await expect(
      signInWithPassword("  qa-agent@talo.test  ", "hunter2"),
    ).resolves.toEqual({ kind: "signed-in", cookie: ISSUED, user: PARSED_USER });

    expect(request).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { identifier: "qa-agent@talo.test", password: "hunter2" },
    });
    expect(writeCookie).toHaveBeenCalledWith(ISSUED);
    expect(getSessionCookie()).toBe(ISSUED);
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("the password is sent as typed — only the identifier is trimmed", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));
    await signInWithPassword("a@b.co", "  spaces matter  ");
    expect(request).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { identifier: "a@b.co", password: "  spaces matter  " },
    });
  });

  test("wrong credentials leave nothing behind", async () => {
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Invalid email or password." },
      sessionCookie: null,
    });

    await expect(signInWithPassword("a@b.co", "wrong")).resolves.toEqual({
      kind: "unauthorised",
      message: "Invalid email or password.",
    });
    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionUser()).toBeNull();
  });

  test("a two-factor challenge stores no credential", async () => {
    request.mockResolvedValueOnce(
      ok({ twoFactorRedirect: true, twoFactorMethods: ["totp"] }, null),
    );

    await expect(signInWithPassword("a@b.co", "right")).resolves.toEqual({
      kind: "two-factor",
    });
    expect(writeCookie).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a keychain that refuses the write still signs the person in for this run", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));
    writeCookie.mockResolvedValueOnce(false);

    await expect(signInWithPassword("a@b.co", "right")).resolves.toMatchObject({
      kind: "signed-in",
    });
    expect(getSessionUser()).toEqual(PARSED_USER);
  });
});

describe("signInWithGoogle", () => {
  test("trades the ID token for a session, and stores what comes back", async () => {
    googleToken.mockResolvedValueOnce({ kind: "token", idToken: ID_TOKEN });
    request.mockResolvedValueOnce(ok(USER, ISSUED));

    await expect(signInWithGoogle()).resolves.toEqual({
      kind: "settled",
      outcome: { kind: "signed-in", cookie: ISSUED, user: PARSED_USER },
    });

    expect(request).toHaveBeenCalledWith("/auth/google", {
      method: "POST",
      body: { idToken: ID_TOKEN },
    });
    expect(writeCookie).toHaveBeenCalledWith(ISSUED);
    expect(getSessionCookie()).toBe(ISSUED);
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("a signed-in person keeps the Google session that signed them in", async () => {
    googleToken.mockResolvedValueOnce({ kind: "token", idToken: ID_TOKEN });
    request.mockResolvedValueOnce(ok(USER, ISSUED));

    await signInWithGoogle();

    expect(releaseGoogle).not.toHaveBeenCalled();
  });

  test("a dismissed account sheet leaves the device exactly as it found it", async () => {
    googleToken.mockResolvedValueOnce({ kind: "cancelled" });

    await expect(signInWithGoogle()).resolves.toEqual({ kind: "cancelled" });
    expect(request).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    // Nothing was established, so there is nothing to undo. Releasing here would
    // be an effect of closing a sheet, which is not a thing closing a sheet does.
    expect(releaseGoogle).not.toHaveBeenCalled();
  });

  test("a device without Play services asks the API nothing either", async () => {
    googleToken.mockResolvedValueOnce({ kind: "no-play-services" });

    await expect(signInWithGoogle()).resolves.toEqual({ kind: "no-play-services" });
    expect(request).not.toHaveBeenCalled();
    expect(releaseGoogle).not.toHaveBeenCalled();
  });

  // Story 13, the half that lives here: Google said yes and our API said no, so
  // nothing may be left holding either side of it.
  test("a token the API refuses leaves nothing here and no Google session", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    googleToken.mockResolvedValueOnce({ kind: "token", idToken: ID_TOKEN });
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Account disabled." },
      sessionCookie: null,
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      kind: "settled",
      outcome: { kind: "unauthorised", message: "Account disabled." },
    });

    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(clearCookie).toHaveBeenCalled();
    // Otherwise the next tap skips the picker and presents the same refused
    // account again, with no way to choose the one that would have worked.
    expect(releaseGoogle).toHaveBeenCalled();
  });

  test("a two-factor account stores no credential and releases the Google session", async () => {
    googleToken.mockResolvedValueOnce({ kind: "token", idToken: ID_TOKEN });
    request.mockResolvedValueOnce(ok({ twoFactorRedirect: true }));

    await expect(signInWithGoogle()).resolves.toEqual({
      kind: "settled",
      outcome: { kind: "two-factor" },
    });

    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(releaseGoogle).toHaveBeenCalled();
  });

  test("a sign-out that overtakes the exchange does not sign anyone back in", async () => {
    googleToken.mockResolvedValueOnce({ kind: "token", idToken: ID_TOKEN });
    request.mockImplementationOnce(async () => {
      await signOut();
      return ok(USER, ISSUED);
    });

    await signInWithGoogle();

    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
  });
});

describe("signOut", () => {
  test("clears everything here, then tells the server which session ended", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(ok(true));

    await signOut();

    // The cookie is handed over explicitly because it is no longer held: nothing
    // the person does while a slow logout is in flight may carry it.
    expect(request).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      cookie: STORED,
    });
    expect(clearCookie).toHaveBeenCalled();
    expect(clearCsrfPair).toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("the credential is already gone by the time the server is told", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockImplementationOnce(async () => {
      expect(getSessionCookie()).toBeNull();
      expect(getSessionUser()).toBeNull();
      return ok(true);
    });

    await signOut();
    expect.assertions(2);
  });

  test("clears everything here even when the server cannot be told", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce({ reached: false });

    await signOut();

    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(clearCookie).toHaveBeenCalled();
  });

  test("with no credential there is nothing to tell the server", async () => {
    await signOut();
    expect(request).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalled();
  });

  // Without this the next person on a shared device is signed straight back in:
  // the native session survives, so the account sheet never reappears.
  test("the Google session is released too, whatever signed the person in", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(ok(true));

    await signOut();

    expect(releaseGoogle).toHaveBeenCalled();
  });
});

/**
 * What a Session end leaves on the device, which is nothing.
 *
 * The three moments are one path — `forgetCredential` — so these are about which
 * of them arrive at it, and about the one that deliberately does not. What is
 * actually destroyed is `lib/session-wipe`'s to say, and mocked away here.
 */
describe("a Session end takes the Store with it", () => {
  test("signing out destroys what this device held", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(ok(true));

    await signOut();

    expect(wipe).toHaveBeenCalledTimes(1);
  });

  // The one thing a Session end destroys that is not on this device: the push
  // registration, removed with a request, and a request needs a credential the
  // line above has already discarded. Captured before it goes, the way the
  // logout call's is.
  test("the ending credential travels with the wipe, so the push row can go", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(ok(true));

    await signOut();

    expect(wipe).toHaveBeenCalledWith(STORED);
  });

  // Nothing to authenticate with is not nothing to wipe. Both halves on this
  // device still go; only the request has no credential to make itself under.
  test("a moment with no credential still wipes, with nothing to present", async () => {
    readCookie.mockResolvedValueOnce(null);

    await hydrateAuth();

    expect(wipe).toHaveBeenCalledWith(null);
  });

  // Ending the session on the server makes the `DELETE` impossible, so the two
  // cannot be left to race for the last moments of a session this client has
  // already given up.
  test("the logout does not overtake the deregistration it would refuse", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    let removedRow = () => {};
    deregistered.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        removedRow = resolve;
      }),
    );
    request.mockResolvedValueOnce(ok(true));

    const ending = signOut();
    await Promise.resolve();
    expect(request).not.toHaveBeenCalledWith("/auth/logout", expect.anything());

    removedRow();
    await ending;
    expect(request).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      cookie: STORED,
    });
  });

  test("a Session expiry destroys it too", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    await authenticatedRequest("/conversations");

    expect(wipe).toHaveBeenCalledTimes(1);
  });

  test("a cookie the API refuses at cold start takes the previous person's with it", async () => {
    readCookie.mockResolvedValueOnce("better-auth.session_token=stale");
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    await hydrateAuth();

    expect(wipe).toHaveBeenCalledTimes(1);
  });

  // The database on disk knows nothing about whose it is. A cold start that
  // finds no cookie is a device nobody is signed in on, so anything a killed
  // sign-out left behind goes before the next person can be shown it.
  test("a cold start with no cookie leaves nothing for the next person", async () => {
    readCookie.mockResolvedValueOnce(null);

    await hydrateAuth();

    expect(wipe).toHaveBeenCalledTimes(1);
  });

  // Not a Session end, and wiped anyway: nothing on this device belongs to a
  // session that was never established. See `forgetCredential`.
  test("a refused sign-in leaves nothing of an earlier one behind either", async () => {
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionCookie: null,
    });

    await signInWithPassword("a@b.co", "wrong");

    expect(wipe).toHaveBeenCalledTimes(1);
  });

  test("an unreachable API keeps the Store, because it is the only thing to draw", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockResolvedValueOnce({ reached: false });

    await hydrateAuth();

    expect(wipe).not.toHaveBeenCalled();
  });

  // The same rule signing out already follows when the server cannot be told.
  test("a wipe that fails does not stop the session ending", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    wipe.mockRejectedValueOnce(new Error("database is locked"));
    request.mockResolvedValueOnce(ok(true));

    await expect(signOut()).resolves.toBeUndefined();

    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(clearCookie).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      cookie: STORED,
    });
  });
});

describe("a sign-out that lands mid-request", () => {
  test("a sign-in that succeeds after it stores no credential", async () => {
    let release: (() => void) | null = null;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });

    request.mockImplementationOnce(async () => {
      await arrived;
      return ok(USER, ISSUED);
    });

    const attempt = signInWithPassword("a@b.co", "right");
    await signOut();
    release!();
    await attempt;

    // The person asked to be signed out. Writing the cookie now would sign them
    // back in at the next cold start.
    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a hydration that succeeds after it signs nobody in", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    let release: (() => void) | null = null;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    request.mockImplementationOnce(async () => {
      await arrived;
      return ok(USER);
    });

    const attempt = hydrateAuth();
    await signOut();
    release!();
    await attempt;

    expect(getSessionUser()).toBeNull();
    expect(getSessionCookie()).toBeNull();
  });
});

describe("authenticatedRequest", () => {
  const CONVERSATIONS = "/conversations";

  function answer(status: number, body: unknown = null) {
    return { reached: true as const, status, body, sessionCookie: null };
  }

  /** Sit where a screen would, listening for the session ending under it. */
  function watchForExpiry() {
    const heard = jest.fn();
    return { heard, stop: onSessionExpired(heard) };
  }

  /** A live session, set up the way `signOut`'s tests do rather than by hydrating. */
  function signedIn() {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
  }

  beforeEach(() => {
    // Not `clearAllMocks`, which leaves a `mockResolvedValueOnce` an earlier test
    // queued but never consumed sitting at the front of the queue.
    request.mockReset();
  });

  test("passes the request through and answers with what came back", async () => {
    signedIn();
    request.mockResolvedValueOnce(ok([{ id: "1" }]));

    await expect(
      authenticatedRequest(CONVERSATIONS, { method: "POST", body: { subject: "Hi" } }),
    ).resolves.toEqual(ok([{ id: "1" }]));
    expect(request).toHaveBeenLastCalledWith(CONVERSATIONS, {
      method: "POST",
      body: { subject: "Hi" },
    });
  });

  test("a 401 clears the credential and tells whoever is listening", async () => {
    signedIn();
    const { heard, stop } = watchForExpiry();
    request.mockResolvedValueOnce(answer(401, { message: "Unauthorized" }));

    await authenticatedRequest(CONVERSATIONS);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(clearCookie).toHaveBeenCalled();
    expect(clearCsrfPair).toHaveBeenCalled();
    stop();
  });

  test("the credential is gone before the listener runs, so nothing it triggers carries it", async () => {
    signedIn();
    const stop = onSessionExpired(() => {
      expect(getSessionCookie()).toBeNull();
      expect(getSessionUser()).toBeNull();
    });
    request.mockResolvedValueOnce(answer(401));

    await authenticatedRequest(CONVERSATIONS);
    expect.assertions(2);
    stop();
  });

  test("a transport failure signs nobody out — this is the line #19 drew", async () => {
    signedIn();
    const { heard, stop } = watchForExpiry();
    request.mockResolvedValueOnce({ reached: false });

    await expect(authenticatedRequest(CONVERSATIONS)).resolves.toEqual({ reached: false });

    expect(heard).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBe(STORED);
    expect(getSessionUser()).toEqual(PARSED_USER);
    expect(clearCookie).not.toHaveBeenCalled();
    stop();
  });

  test.each([403, 404, 409, 429, 500, 503])(
    "a %s is about the request, not the session, so the credential survives",
    async (status) => {
      signedIn();
      const { heard, stop } = watchForExpiry();
      request.mockResolvedValueOnce(answer(status, { message: "No" }));

      await authenticatedRequest(CONVERSATIONS);

      expect(heard).not.toHaveBeenCalled();
      expect(getSessionCookie()).toBe(STORED);
      stop();
    },
  );

  test("a second 401 from a request already in flight does not report twice", async () => {
    signedIn();
    const { heard, stop } = watchForExpiry();
    request.mockResolvedValue(answer(401));

    await Promise.all([
      authenticatedRequest(CONVERSATIONS),
      authenticatedRequest("/conversations/1"),
    ]);

    // The session ended once. Two reports would send two navigations at the
    // sign-in screen, and the second would arrive after someone started typing.
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  test("a listener that has stopped hears nothing", async () => {
    signedIn();
    const { heard, stop } = watchForExpiry();
    stop();
    request.mockResolvedValueOnce(answer(401));

    await authenticatedRequest(CONVERSATIONS);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("requesting a magic link", () => {
  const SENT = { reached: true as const, status: 200, body: { data: true }, sessionCookie: null };

  test("the API is asked to send, and told where this build's links have to point", async () => {
    request.mockResolvedValueOnce(SENT);

    await expect(requestMagicLink("first-timer@talo.test")).resolves.toEqual({ kind: "sent" });

    expect(request).toHaveBeenCalledWith("/auth/magic-link", {
      method: "POST",
      body: { identifier: "first-timer@talo.test", url: "https://app.example.com" },
    });
  });

  test("a typed address is trimmed, the way a password sign-in's is", async () => {
    request.mockResolvedValueOnce(SENT);

    await requestMagicLink("  first-timer@talo.test \n");

    expect(request).toHaveBeenCalledWith(
      "/auth/magic-link",
      expect.objectContaining({ body: { identifier: "first-timer@talo.test", url: "https://app.example.com" } }),
    );
  });

  test("asking for a link touches no credential", async () => {
    setSessionCookie(STORED);
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(SENT);

    await requestMagicLink("first-timer@talo.test");

    // Nothing is established and nothing is refused, so there is nothing here to
    // store and nothing to erase — including the session of whoever is signed in.
    expect(getSessionCookie()).toBe(STORED);
    expect(getSessionUser()).toEqual(PARSED_USER);
    expect(writeCookie).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });

  test("another link can be asked for without anything being reset first", async () => {
    request.mockResolvedValue(SENT);

    await expect(requestMagicLink("first-timer@talo.test")).resolves.toEqual({ kind: "sent" });
    await expect(requestMagicLink("first-timer@talo.test")).resolves.toEqual({ kind: "sent" });

    expect(request).toHaveBeenCalledTimes(2);
  });

  test("a name is sent, since verifying the link is what creates the account", async () => {
    request.mockResolvedValueOnce(SENT);

    await requestMagicLink("first-timer@talo.test", "Jordan Ellis");

    expect(request).toHaveBeenCalledWith(
      "/auth/magic-link",
      expect.objectContaining({
        body: {
          identifier: "first-timer@talo.test",
          name: "Jordan Ellis",
          url: "https://app.example.com",
        },
      }),
    );
  });

  test("a typed name is trimmed, the way the address already is", async () => {
    request.mockResolvedValueOnce(SENT);

    await requestMagicLink("first-timer@talo.test", "  Jordan Ellis \n");

    expect(request).toHaveBeenCalledWith(
      "/auth/magic-link",
      expect.objectContaining({
        body: expect.objectContaining({ name: "Jordan Ellis" }),
      }),
    );
  });

  // The field is optional, and the API would take an empty string and store it —
  // so an untouched field has to leave the key off the body entirely, or it
  // creates exactly the nameless account it exists to prevent.
  test.each([
    ["nothing was passed", undefined],
    ["the field was left empty", ""],
    ["the field holds only whitespace", "   \n\t"],
  ])("no name is sent when %s", async (_case, typed) => {
    request.mockResolvedValueOnce(SENT);

    await requestMagicLink("first-timer@talo.test", typed);

    expect(request).toHaveBeenCalledWith("/auth/magic-link", {
      method: "POST",
      body: { identifier: "first-timer@talo.test", url: "https://app.example.com" },
    });
  });
});

describe("verifying a magic link", () => {
  test("a verified link stores the Session cookie exactly as a password does", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));

    await expect(verifyMagicLink("tok-en")).resolves.toEqual({
      kind: "signed-in",
      cookie: ISSUED,
      user: PARSED_USER,
    });

    expect(request).toHaveBeenCalledWith("/auth/magic-link/verify?token=tok-en");
    expect(writeCookie).toHaveBeenCalledWith(ISSUED);
    expect(getSessionCookie()).toBe(ISSUED);
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("a token is escaped, so it cannot append a second query parameter", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));

    await verifyMagicLink("a&callbackURL=https://evil.test");

    expect(request).toHaveBeenCalledWith(
      "/auth/magic-link/verify?token=a%26callbackURL%3Dhttps%3A%2F%2Fevil.test",
    );
  });

  test("a refused link leaves nothing behind", async () => {
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { code: "invalid_magic_link", message: "This magic link is invalid." },
      sessionCookie: null,
    });

    await expect(verifyMagicLink("spent")).resolves.toEqual({
      kind: "unauthorised",
      message: "This magic link is invalid.",
    });

    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a two-factor account is refused here with nothing stored, as on the password path", async () => {
    request.mockResolvedValueOnce(ok({ twoFactorRedirect: true }, ISSUED));

    await expect(verifyMagicLink("tok-en")).resolves.toEqual({ kind: "two-factor" });

    // The challenge's cookie is a half-signed-in credential this app has no
    // second step for. Keeping it would be worse than refusing.
    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
  });

  test("a link tapped with no network changes nothing at all", async () => {
    request.mockResolvedValueOnce({ reached: false });

    await expect(verifyMagicLink("tok-en")).resolves.toEqual({ kind: "transport-failure" });

    expect(writeCookie).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });

  test("a sign-out that overtakes a verification does not sign anyone back in", async () => {
    let release: (() => void) | null = null;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    request.mockImplementationOnce(async () => {
      await arrived;
      return ok(USER, ISSUED);
    });

    const verifying = verifyMagicLink("tok-en");
    await signOut();
    release!();
    await verifying;

    // The epoch moved while the request was out, so the credential it came back
    // with is stale — writing it would leave a live cookie for the next launch.
    expect(writeCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
  });
});
