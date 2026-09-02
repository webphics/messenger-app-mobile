import {
  apiRequest,
  clearCsrfPair,
  getSessionCookie,
  setSessionCookie,
} from "@/lib/api-client";
import { hydrateAuth, signInWithPassword, signOut } from "@/lib/auth-service";
import {
  clearRetiredCredential,
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import { getSessionUser, setSessionUser } from "@/lib/session";

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

jest.mock("@/lib/keychain", () => ({
  readSessionCookie: jest.fn(),
  writeSessionCookie: jest.fn(async () => true),
  clearSessionCookie: jest.fn(async () => true),
  clearRetiredCredential: jest.fn(async () => undefined),
}));

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
const readCookie = readSessionCookie as jest.MockedFunction<typeof readSessionCookie>;
const writeCookie = writeSessionCookie as jest.MockedFunction<typeof writeSessionCookie>;
const clearCookie = clearSessionCookie as jest.MockedFunction<typeof clearSessionCookie>;

const STORED = "better-auth.session_token=stored";
const ISSUED = "better-auth.session_token=issued";

const USER = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  publicId: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
};

const PARSED_USER = {
  id: USER.id,
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent" as const,
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
    await expect(hydrateAuth()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
  });

  test("a live cookie signs its owner in and is held for later requests", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockResolvedValueOnce(ok(USER));

    await expect(hydrateAuth()).resolves.toEqual({
      kind: "signed-in",
      cookie: STORED,
      user: PARSED_USER,
    });
    expect(request).toHaveBeenCalledWith("/auth/session");
    expect(getSessionCookie()).toBe(STORED);
    expect(getSessionUser()).toEqual(PARSED_USER);
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

    await expect(hydrateAuth()).resolves.toMatchObject({ kind: "unauthorised" });
    expect(clearCookie).toHaveBeenCalled();
    expect(getSessionCookie()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("an unreachable API keeps the cookie rather than signing anyone out", async () => {
    readCookie.mockResolvedValueOnce(STORED);
    request.mockResolvedValueOnce({ reached: false });

    await expect(hydrateAuth()).resolves.toEqual({ kind: "transport-failure" });
    expect(clearCookie).not.toHaveBeenCalled();
    expect(getSessionCookie()).toBe(STORED);
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
      body: { email: "qa-agent@talo.test", password: "hunter2" },
    });
    expect(writeCookie).toHaveBeenCalledWith(ISSUED);
    expect(getSessionCookie()).toBe(ISSUED);
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("the password is sent as typed — only the email is trimmed", async () => {
    request.mockResolvedValueOnce(ok(USER, ISSUED));
    await signInWithPassword("a@b.co", "  spaces matter  ");
    expect(request).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { email: "a@b.co", password: "  spaces matter  " },
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
