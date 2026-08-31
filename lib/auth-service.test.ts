import { apiRequest, getBearerToken, setBearerToken } from "@/lib/api-client";
import { hydrateAuth, signInWithPassword, signOut } from "@/lib/auth-service";
import { clearSessionToken, readSessionToken, writeSessionToken } from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import { getSessionUser, setSessionUser } from "@/lib/session";

jest.mock("@/lib/api-client", () => {
  let held: string | null = null;
  return {
    apiRequest: jest.fn(),
    setBearerToken: jest.fn((token: string | null) => {
      held = token;
    }),
    getBearerToken: jest.fn(() => held),
  };
});

jest.mock("@/lib/legacy-session", () => ({
  purgeMockSession: jest.fn(async () => undefined),
}));

jest.mock("@/lib/keychain", () => ({
  readSessionToken: jest.fn(),
  writeSessionToken: jest.fn(async () => true),
  clearSessionToken: jest.fn(async () => true),
}));

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
const readToken = readSessionToken as jest.MockedFunction<typeof readSessionToken>;
const writeToken = writeSessionToken as jest.MockedFunction<typeof writeSessionToken>;
const clearToken = clearSessionToken as jest.MockedFunction<typeof clearSessionToken>;

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

function ok(data: unknown, sessionToken: string | null = null) {
  return { reached: true as const, status: 200, body: { data }, sessionToken };
}

beforeEach(() => {
  jest.clearAllMocks();
  setBearerToken(null);
  setSessionUser(null);
  writeToken.mockResolvedValue(true);
  clearToken.mockResolvedValue(true);
});

describe("hydrateAuth", () => {
  test("sweeps up the mock shell's stored session on the way past", async () => {
    readToken.mockResolvedValueOnce(null);
    await hydrateAuth();
    expect(purgeMockSession).toHaveBeenCalled();
  });

  test("no stored token means nothing to check", async () => {
    readToken.mockResolvedValueOnce(null);
    await expect(hydrateAuth()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(getBearerToken()).toBeNull();
  });

  test("a live token signs its owner in and is held for later requests", async () => {
    readToken.mockResolvedValueOnce("stored-token");
    request.mockResolvedValueOnce(ok(USER));

    await expect(hydrateAuth()).resolves.toEqual({
      kind: "signed-in",
      token: "stored-token",
      user: PARSED_USER,
    });
    expect(request).toHaveBeenCalledWith("/auth/session");
    expect(getBearerToken()).toBe("stored-token");
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("the credential is held before the request, so it is the one presented", async () => {
    readToken.mockResolvedValueOnce("stored-token");
    request.mockImplementationOnce(async () => {
      expect(getBearerToken()).toBe("stored-token");
      return ok(USER);
    });
    await hydrateAuth();
    expect.assertions(1);
  });

  test("a rejected token is erased from the keychain", async () => {
    readToken.mockResolvedValueOnce("stale-token");
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: "Unauthorized" },
      sessionToken: null,
    });

    await expect(hydrateAuth()).resolves.toMatchObject({ kind: "unauthorised" });
    expect(clearToken).toHaveBeenCalled();
    expect(getBearerToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("an unreachable API keeps the token rather than signing anyone out", async () => {
    readToken.mockResolvedValueOnce("stored-token");
    request.mockResolvedValueOnce({ reached: false });

    await expect(hydrateAuth()).resolves.toEqual({ kind: "transport-failure" });
    expect(clearToken).not.toHaveBeenCalled();
    expect(getBearerToken()).toBe("stored-token");
  });
});

describe("signInWithPassword", () => {
  test("posts the credentials and stores what comes back", async () => {
    request.mockResolvedValueOnce(ok(USER, "issued-token"));

    await expect(
      signInWithPassword("  qa-agent@talo.test  ", "hunter2"),
    ).resolves.toEqual({ kind: "signed-in", token: "issued-token", user: PARSED_USER });

    expect(request).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { email: "qa-agent@talo.test", password: "hunter2" },
    });
    expect(writeToken).toHaveBeenCalledWith("issued-token");
    expect(getBearerToken()).toBe("issued-token");
    expect(getSessionUser()).toEqual(PARSED_USER);
  });

  test("the password is sent as typed — only the email is trimmed", async () => {
    request.mockResolvedValueOnce(ok(USER, "issued-token"));
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
      sessionToken: null,
    });

    await expect(signInWithPassword("a@b.co", "wrong")).resolves.toEqual({
      kind: "unauthorised",
      message: "Invalid email or password.",
    });
    expect(writeToken).not.toHaveBeenCalled();
    expect(getSessionUser()).toBeNull();
  });

  test("a two-factor challenge stores no credential", async () => {
    request.mockResolvedValueOnce(
      ok({ twoFactorRedirect: true, twoFactorMethods: ["totp"] }, null),
    );

    await expect(signInWithPassword("a@b.co", "right")).resolves.toEqual({
      kind: "two-factor",
    });
    expect(writeToken).not.toHaveBeenCalled();
    expect(clearToken).toHaveBeenCalled();
    expect(getBearerToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a keychain that refuses the write still signs the person in for this run", async () => {
    request.mockResolvedValueOnce(ok(USER, "issued-token"));
    writeToken.mockResolvedValueOnce(false);

    await expect(signInWithPassword("a@b.co", "right")).resolves.toMatchObject({
      kind: "signed-in",
    });
    expect(getSessionUser()).toEqual(PARSED_USER);
  });
});

describe("signOut", () => {
  test("clears everything here, then tells the server which session ended", async () => {
    setBearerToken("held-token");
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce(ok(true));

    await signOut();

    // The token is handed over explicitly because it is no longer held: nothing
    // the person does while a slow logout is in flight may carry it.
    expect(request).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      bearer: "held-token",
    });
    expect(clearToken).toHaveBeenCalled();
    expect(getBearerToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("the credential is already gone by the time the server is told", async () => {
    setBearerToken("held-token");
    setSessionUser(PARSED_USER);
    request.mockImplementationOnce(async () => {
      expect(getBearerToken()).toBeNull();
      expect(getSessionUser()).toBeNull();
      return ok(true);
    });

    await signOut();
    expect.assertions(2);
  });

  test("clears everything here even when the server cannot be told", async () => {
    setBearerToken("held-token");
    setSessionUser(PARSED_USER);
    request.mockResolvedValueOnce({ reached: false });

    await signOut();

    expect(getBearerToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
    expect(clearToken).toHaveBeenCalled();
  });

  test("with no credential there is nothing to tell the server", async () => {
    await signOut();
    expect(request).not.toHaveBeenCalled();
    expect(clearToken).toHaveBeenCalled();
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
      return ok(USER, "issued-token");
    });

    const attempt = signInWithPassword("a@b.co", "right");
    await signOut();
    release!();
    await attempt;

    // The person asked to be signed out. Writing the token now would sign them
    // back in at the next cold start.
    expect(writeToken).not.toHaveBeenCalled();
    expect(getBearerToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
  });

  test("a hydration that succeeds after it signs nobody in", async () => {
    readToken.mockResolvedValueOnce("stored-token");
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
    expect(getBearerToken()).toBeNull();
  });
});
