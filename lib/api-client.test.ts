import { API_BASE_URL } from "@/lib/api-config";
import {
  apiRequest,
  clearCsrfPair,
  findSessionCookie,
  getSessionCookie,
  readCookieValue,
  setSessionCookie,
} from "@/lib/api-client";

type FetchCall = { url: string; init: RequestInit };

const calls: FetchCall[] = [];

/**
 * Responses this test wants, in order. Queued rather than stubbed per-call with
 * `mockResolvedValueOnce`, because a mutation can make three requests — the CSRF
 * pre-flight, the request, and a retry — and a once-stub would silently be
 * consumed by the first of them.
 */
let queue: (Response | Error)[] = [];

function enqueue(...responses: (Response | Error)[]): void {
  queue.push(...responses);
}

/** A minimal stand-in for the parts of `Response` this client touches. */
function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const lookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lookup.get(name.toLowerCase()) ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError("Unexpected end of JSON input");
      return body;
    },
  } as unknown as Response;
}

function csrfResponse(token = "csrf-token-value", cookie = "cookie-value"): Response {
  return response(
    200,
    { statusCode: 200, message: "Success", data: token },
    { "set-cookie": `csrf-token=${cookie}; Path=/; HttpOnly; SameSite=Lax` },
  );
}

/** The API's own refusal from `csrf.error.ts`, trimmed to what this client reads. */
function csrfRefusal(): Response {
  return response(403, { statusCode: 403, code: "csrf_invalid", message: "Invalid CSRF token." });
}

function headersOf(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

const SESSION_COOKIE = "better-auth.session_token=abc.def";

beforeEach(() => {
  calls.length = 0;
  queue = [];
  setSessionCookie(null);
  clearCsrfPair();
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next ?? response(200, {});
  }) as unknown as typeof fetch;
});

describe("readCookieValue", () => {
  test("reads a value from a single Set-Cookie header", () => {
    expect(readCookieValue("csrf-token=abc123; Path=/; HttpOnly", "csrf-token")).toBe("abc123");
  });

  test("reads a value out of the comma-joined header React Native produces", () => {
    const joined =
      "other=1; Path=/, csrf-token=abc.def; Path=/; HttpOnly, third=3; Path=/";
    expect(readCookieValue(joined, "csrf-token")).toBe("abc.def");
  });

  test("matches the whole name, not a suffix of a longer one", () => {
    expect(readCookieValue("x-csrf-token=wrong; Path=/", "csrf-token")).toBeNull();
  });

  test.each([null, "", "other=1; Path=/", "csrf-token=; Path=/"])(
    "returns null for %p",
    (header) => {
      expect(readCookieValue(header, "csrf-token")).toBeNull();
    },
  );
});

describe("findSessionCookie", () => {
  test("returns the pair to replay, name included", () => {
    expect(
      findSessionCookie("better-auth.session_token=abc.def; Path=/; HttpOnly; Max-Age=604800"),
    ).toBe("better-auth.session_token=abc.def");
  });

  test("keeps the __Secure- prefix the API adds when it runs with secure cookies", () => {
    expect(
      findSessionCookie("__Secure-better-auth.session_token=abc.def; Path=/; Secure"),
    ).toBe("__Secure-better-auth.session_token=abc.def");
  });

  test("finds it among the other cookies the API sets on the same response", () => {
    const joined =
      "better-auth.session_data=cached; Path=/, better-auth.session_token=abc.def; Path=/; HttpOnly, csrf-token=xyz; Path=/";
    expect(findSessionCookie(joined)).toBe("better-auth.session_token=abc.def");
  });

  /**
   * `Expires` carries a comma of its own, which the comma-joined header gives
   * this no way to tell from a separator. It survives because the fragments it
   * splits into are not `name=value` pairs for any name being looked for — worth
   * pinning, because the failure mode is picking up a date as a credential.
   */
  test("is not confused by the comma inside an Expires attribute", () => {
    const joined =
      "better-auth.session_token=abc.def; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly";
    expect(findSessionCookie(joined)).toBe("better-auth.session_token=abc.def");
  });

  test("does not mistake the session_data cache cookie for the credential", () => {
    expect(findSessionCookie("better-auth.session_data=cached; Path=/")).toBeNull();
  });

  test.each([
    ["no header at all", null],
    ["a response that set no cookies", ""],
    ["a response that set only the CSRF cookie", "csrf-token=xyz; Path=/"],
    ["a session cookie being cleared", "better-auth.session_token=; Path=/; Max-Age=0"],
  ])("returns null for %s", (_label, header) => {
    expect(findSessionCookie(header)).toBeNull();
  });
});

describe("the held credential", () => {
  test("round-trips and can be cleared", () => {
    expect(getSessionCookie()).toBeNull();
    setSessionCookie(SESSION_COOKIE);
    expect(getSessionCookie()).toBe(SESSION_COOKIE);
    setSessionCookie(null);
    expect(getSessionCookie()).toBeNull();
  });
});

/**
 * The one that fails in the worst possible way if it regresses: it works on
 * Android and in Expo Go, then 401s on an iOS device because
 * `NSHTTPCookieStorage` overwrote the header this client set. Nothing about the
 * app looks wrong at that point; it looks like a server bug.
 */
describe("taking the platform cookie store out of the path", () => {
  test("every request omits credentials — reads, mutations, pre-flights and retries", async () => {
    setSessionCookie(SESSION_COOKIE);

    await apiRequest("/auth/session");
    enqueue(csrfResponse(), csrfRefusal(), csrfResponse("fresh", "fresh-cookie"), response(200, {}));
    await apiRequest("/auth/logout", { method: "POST" });

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.init.credentials).toBe("omit");
    }
  });

  test("the Cookie header is written here, so it is the one that goes out", async () => {
    setSessionCookie(SESSION_COOKIE);
    await apiRequest("/auth/session");
    expect(headersOf(calls[0]).Cookie).toBe(SESSION_COOKIE);
  });
});

describe("apiRequest", () => {
  test("targets the configured base URL", async () => {
    await apiRequest("/auth/session");
    expect(calls[0].url).toBe(`${API_BASE_URL}/auth/session`);
  });

  test("attaches the Session cookie without the call site asking", async () => {
    setSessionCookie(SESSION_COOKIE);
    await apiRequest("/auth/session");
    expect(headersOf(calls[0]).Cookie).toBe(SESSION_COOKIE);
  });

  test("sends no Cookie header at all when there is nothing to send", async () => {
    await apiRequest("/auth/session");
    expect(headersOf(calls[0]).Cookie).toBeUndefined();
  });

  test("an explicit cookie is presented even when none is held", async () => {
    enqueue(csrfResponse(), response(200, {}));
    await apiRequest("/auth/logout", { method: "POST", cookie: "ending=session" });
    expect(headersOf(calls[1]).Cookie).toBe("ending=session; csrf-token=cookie-value");
  });

  test("an explicit cookie overrides the held one", async () => {
    setSessionCookie(SESSION_COOKIE);
    enqueue(csrfResponse(), response(200, {}));
    await apiRequest("/auth/logout", { method: "POST", cookie: "ending=session" });
    expect(headersOf(calls[1]).Cookie).toContain("ending=session");
    expect(headersOf(calls[1]).Cookie).not.toContain(SESSION_COOKIE);
  });

  test("serialises a JSON body and declares its type", async () => {
    await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });
    expect(calls[calls.length - 1].init.body).toBe('{"email":"a@b.co"}');
    expect(headersOf(calls[calls.length - 1])["Content-Type"]).toBe("application/json");
  });

  test("reads the Session cookie off the response, case-insensitively", async () => {
    enqueue(
      csrfResponse(),
      response(200, { data: {} }, { "Set-Cookie": "better-auth.session_token=issued; Path=/" }),
    );
    const outcome = await apiRequest("/auth/login", { method: "POST" });
    expect(outcome).toMatchObject({
      reached: true,
      sessionCookie: "better-auth.session_token=issued",
    });
  });

  test("reports the status and parsed body", async () => {
    enqueue(response(401, { message: "Invalid email or password." }));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 401,
      body: { message: "Invalid email or password." },
      sessionCookie: null,
    });
  });

  test("a body that is not JSON reads as no body rather than throwing", async () => {
    enqueue(response(502, undefined));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 502,
      body: null,
      sessionCookie: null,
    });
  });

  test("a request that never got an answer is reported, not thrown", async () => {
    enqueue(new TypeError("Network request failed"));
    await expect(apiRequest("/auth/session")).resolves.toEqual({ reached: false });
  });
});

describe("the CSRF pair", () => {
  test("a mutation fetches it and presents both halves", async () => {
    setSessionCookie(SESSION_COOKIE);
    enqueue(csrfResponse(), response(200, {}));
    await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(`${API_BASE_URL}/csrf`);

    const headers = headersOf(calls[1]);
    expect(headers["x-csrf-token"]).toBe("csrf-token-value");
    expect(headers.Cookie).toBe(`${SESSION_COOKIE}; csrf-token=cookie-value`);
  });

  test("is fetched once and reused by every later mutation", async () => {
    enqueue(csrfResponse(), response(200, {}), response(200, {}), response(200, {}));

    await apiRequest("/auth/login", { method: "POST" });
    await apiRequest("/auth/logout", { method: "POST" });
    await apiRequest("/conversations/1", { method: "PATCH", body: { read: true } });

    expect(calls.filter((call) => call.url.endsWith("/csrf"))).toHaveLength(1);
    for (const call of calls.slice(1)) {
      expect(headersOf(call)["x-csrf-token"]).toBe("csrf-token-value");
    }
  });

  test("concurrent mutations share one fetch rather than racing for two", async () => {
    enqueue(csrfResponse(), response(200, {}), response(200, {}));

    await Promise.all([
      apiRequest("/auth/logout", { method: "POST" }),
      apiRequest("/auth/logout", { method: "POST" }),
    ]);

    expect(calls.filter((call) => call.url.endsWith("/csrf"))).toHaveLength(1);
  });

  test("a read needs no pair, so it costs no pre-flight", async () => {
    await apiRequest("/auth/session");
    expect(calls).toHaveLength(1);
    expect(headersOf(calls[0])["x-csrf-token"]).toBeUndefined();
  });

  test.each([
    ["the pre-flight was refused", () => enqueue(response(500, null))],
    ["the pre-flight never answered", () => enqueue(new TypeError("Network request failed"))],
    ["the pre-flight set no cookie", () => enqueue(response(200, { data: "token" }))],
    [
      "the pre-flight returned no token",
      () => enqueue(response(200, { data: null }, { "set-cookie": "csrf-token=c; Path=/" })),
    ],
  ])("still sends the request when %s", async (_label, arrange) => {
    arrange();
    const outcome = await apiRequest("/auth/login", { method: "POST" });

    const sent = calls[calls.length - 1];
    expect(sent.url).toBe(`${API_BASE_URL}/auth/login`);
    expect(headersOf(sent)["x-csrf-token"]).toBeUndefined();
    expect(outcome).toMatchObject({ reached: true });
  });
});

describe("a CSRF refusal", () => {
  test("refreshes the pair and retries the request once", async () => {
    enqueue(
      csrfResponse("stale", "stale-cookie"),
      csrfRefusal(),
      csrfResponse("fresh", "fresh-cookie"),
      response(200, { data: {} }, { "set-cookie": "better-auth.session_token=issued; Path=/" }),
    );

    const outcome = await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });

    expect(calls.map((call) => call.url)).toEqual([
      `${API_BASE_URL}/csrf`,
      `${API_BASE_URL}/auth/login`,
      `${API_BASE_URL}/csrf`,
      `${API_BASE_URL}/auth/login`,
    ]);
    expect(headersOf(calls[3])["x-csrf-token"]).toBe("fresh");
    expect(headersOf(calls[3]).Cookie).toBe("csrf-token=fresh-cookie");
    // The retry is the same request, not a truncated one.
    expect(calls[3].init.body).toBe('{"email":"a@b.co"}');
    expect(outcome).toMatchObject({ status: 200 });
  });

  test("exactly once — a second refusal is returned rather than retried again", async () => {
    enqueue(
      csrfResponse("stale", "stale-cookie"),
      csrfRefusal(),
      csrfResponse("fresh", "fresh-cookie"),
      csrfRefusal(),
    );

    const outcome = await apiRequest("/auth/logout", { method: "POST" });

    expect(calls.filter((call) => call.url.endsWith("/auth/logout"))).toHaveLength(2);
    expect(outcome).toMatchObject({ status: 403 });
  });

  test("a refusal that survives the retry keeps the API's own words", async () => {
    enqueue(csrfResponse(), csrfRefusal(), csrfResponse("fresh", "fresh-cookie"), csrfRefusal());

    expect(await apiRequest("/auth/logout", { method: "POST" })).toEqual({
      reached: true,
      status: 403,
      body: { statusCode: 403, code: "csrf_invalid", message: "Invalid CSRF token." },
      sessionCookie: null,
    });
  });
});

describe("a 403 that a fresh token could not fix", () => {
  test("is not retried, and does not refresh the pair", async () => {
    enqueue(
      csrfResponse(),
      response(403, { statusCode: 403, code: "email_not_verified", message: "Verify first." }),
    );

    const outcome = await apiRequest("/auth/login", { method: "POST" });

    expect(calls).toHaveLength(2);
    expect(outcome).toMatchObject({ status: 403 });
  });

  test("wrong credentials are a 401, which never touches the CSRF path", async () => {
    enqueue(
      csrfResponse(),
      response(401, { statusCode: 401, code: "invalid_credentials", message: "Invalid email or password." }),
    );

    const outcome = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: "a@b.co", password: "wrong" },
    });

    expect(calls.filter((call) => call.url.endsWith("/csrf"))).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith("/auth/login"))).toHaveLength(1);
    expect(outcome).toMatchObject({ status: 401 });
  });

  test("a 403 on a read is never a CSRF refusal, so it is not retried", async () => {
    enqueue(response(403, null));
    const outcome = await apiRequest("/auth/session");
    expect(calls).toHaveLength(1);
    expect(outcome).toMatchObject({ status: 403 });
  });

  /**
   * A 403 the API did not raise — a proxy, a gateway — carries no code. A fresh
   * token cannot fix it, and retrying would send the request body a second time.
   */
  test("a codeless 403 is not retried, so a mutation is never sent twice for nothing", async () => {
    enqueue(csrfResponse(), response(403, null));

    const outcome = await apiRequest("/conversations", {
      method: "POST",
      body: { subject: "Only sent once" },
    });

    expect(calls.filter((call) => call.url.endsWith("/conversations"))).toHaveLength(1);
    expect(outcome).toMatchObject({ status: 403 });
  });
});
