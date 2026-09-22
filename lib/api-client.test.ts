import { API_BASE_URL } from "@/lib/api-config";
import {
  apiRequest,
  clearCsrfPair,
  findChallengeCookie,
  findSessionCookie,
  getSessionCookie,
  readCookieValue,
  REQUEST_DEADLINE_MS,
  setSessionCookie,
} from "@/lib/api-client";
import { saysSessionExpired } from "@/lib/auth-response";

type FetchCall = { url: string; init: RequestInit };

const calls: FetchCall[] = [];

/**
 * Responses this test wants, in order. Queued rather than stubbed per-call with
 * `mockResolvedValueOnce`, because a mutation can make three requests — the CSRF
 * pre-flight, the request, and a retry — and a once-stub would silently be
 * consumed by the first of them.
 */
let queue: Queued[] = [];

function enqueue(...responses: Queued[]): void {
  queue.push(...responses);
}

/**
 * A request the server never answers, queued like any other response.
 *
 * The one thing a mocked `fetch` cannot express by resolving: every other case
 * here settles, and the whole point of a deadline is what happens when nothing
 * does.
 */
const HANGS = Symbol("hangs");

type Queued = Response | Error | typeof HANGS | ((init: RequestInit) => Response);

/**
 * Headers that arrive, and a body that then never does.
 *
 * The other half of being abandoned, and the one that does not look like it:
 * the request reached the API and said something, so only the signal separates
 * a body still on its way from a body this client could not parse.
 */
function stalledBody(status: number): (init: RequestInit) => Response {
  return (init) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => null },
      json: () => mockHang(init.signal),
    }) as unknown as Response;
}

/**
 * Never answers, and rejects the way a real `fetch` does once its signal is
 * aborted. A caller that passed no signal waits forever, which is the failure
 * this is here to catch.
 */
function mockHang(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    const abort = () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort);
  });
}

/** Whether a promise has settled, asked without awaiting it. */
function watch(promise: Promise<unknown>): () => boolean {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  return () => done;
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

/**
 * What the native uploader was asked to do, and what it will answer with.
 *
 * `expo-file-system` is mocked rather than the platform beneath it: a file
 * upload never reaches `fetch` at all — that is the point of it — so the
 * queue above cannot stand in for one.
 */
type UploadCall = {
  uri: string;
  url: string;
  options: {
    headers: Record<string, string>;
    signal?: AbortSignal;
    onProgress?: (data: { bytesSent: number; totalBytes: number }) => void;
    [key: string]: unknown;
  };
};

type QueuedUpload = { status: number; body: string } | Error | typeof HANGS;

const mockUploads: UploadCall[] = [];
const mockUploadQueue: QueuedUpload[] = [];
const uploads = mockUploads;

function enqueueUpload(...answers: QueuedUpload[]): void {
  mockUploadQueue.push(...answers);
}

/** `UploadType.MULTIPART`, as the mock below reports it. */
const MULTIPART = 1;

jest.mock("expo-file-system", () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async upload(url: string, options: UploadCall["options"]) {
      mockUploads.push({ uri: this.uri, url, options });
      const answer = mockUploadQueue.shift();
      if (!answer) throw new Error("no upload answer was queued");
      if (answer instanceof Error) throw answer;
      // Recognised by type rather than by identity: the factory is hoisted above
      // this file and may close over nothing but a `mock`-prefixed binding, so
      // `HANGS` itself is not in scope here.
      if (typeof answer === "symbol") return mockHang(options.signal);
      return { status: answer.status, body: answer.body, headers: {} };
    }
  },
}));

beforeEach(() => {
  calls.length = 0;
  queue = [];
  mockUploads.length = 0;
  mockUploadQueue.length = 0;
  setSessionCookie(null);
  clearCsrfPair();
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (next === HANGS) return mockHang(init.signal);
    if (typeof next === "function") return next(init);
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

/**
 * The other credential, and the whole of what was blocking two-factor on this
 * device: the response that raises the challenge sets this cookie, and until now
 * every cookie that was not the Session one was thrown away as it arrived. See
 * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`.
 */
describe("findChallengeCookie", () => {
  test("returns the pair to replay, name included", () => {
    expect(
      findChallengeCookie("better-auth.two_factor=chal.lenge; Path=/; HttpOnly; Max-Age=600"),
    ).toBe("better-auth.two_factor=chal.lenge");
  });

  test("keeps the __Secure- prefix the API adds when it runs with secure cookies", () => {
    expect(
      findChallengeCookie("__Secure-better-auth.two_factor=chal.lenge; Path=/; Secure"),
    ).toBe("__Secure-better-auth.two_factor=chal.lenge");
  });

  test("finds it in the comma-joined header React Native produces", () => {
    const joined =
      "better-auth.session_data=cached; Path=/, better-auth.two_factor=chal.lenge; Path=/; HttpOnly, csrf-token=xyz; Path=/";
    expect(findChallengeCookie(joined)).toBe("better-auth.two_factor=chal.lenge");
  });

  test("is not confused by the comma inside an Expires attribute", () => {
    const joined =
      "better-auth.two_factor=chal.lenge; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly";
    expect(findChallengeCookie(joined)).toBe("better-auth.two_factor=chal.lenge");
  });

  /**
   * The two cookies are looked for separately and must stay that way. A
   * challenge read as a session would be written to the keychain, and a session
   * read as a challenge would be presented to a route that establishes one.
   */
  test("does not answer with the Session cookie, and is not answered by it", () => {
    const session = "better-auth.session_token=abc.def; Path=/; HttpOnly";
    expect(findChallengeCookie(session)).toBeNull();
    expect(findSessionCookie("better-auth.two_factor=chal.lenge; Path=/")).toBeNull();
  });

  test.each([
    ["no header at all", null],
    ["a response that set no cookies", ""],
    ["a response that set only the CSRF cookie", "csrf-token=xyz; Path=/"],
    ["a challenge being cleared", "better-auth.two_factor=; Path=/; Max-Age=0"],
  ])("returns null for %s", (_label, header) => {
    expect(findChallengeCookie(header)).toBeNull();
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

  /**
   * The response that raises a two-factor challenge: a 200 carrying no session
   * and a cookie that is good for ten minutes. Every cookie but the Session one
   * used to be dropped here, which is why an account with a second factor could
   * not sign in on this device at all.
   */
  test("reads the two-factor challenge off the response as well", async () => {
    enqueue(
      csrfResponse(),
      response(
        200,
        { data: { twoFactorRedirect: true, twoFactorMethods: ["totp"] } },
        { "Set-Cookie": "better-auth.two_factor=chal.lenge; Path=/; Max-Age=600" },
      ),
    );
    expect(await apiRequest("/auth/login", { method: "POST" })).toMatchObject({
      reached: true,
      sessionCookie: null,
      challengeCookie: "better-auth.two_factor=chal.lenge",
    });
  });

  test("reports the status and parsed body", async () => {
    enqueue(response(401, { message: "Invalid email or password." }));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 401,
      body: { message: "Invalid email or password." },
      sessionCookie: null,
      challengeCookie: null,
    });
  });

  test("a body that is not JSON reads as no body rather than throwing", async () => {
    enqueue(response(502, undefined));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 502,
      body: null,
      sessionCookie: null,
      challengeCookie: null,
    });
  });

  test("a request that never got an answer is reported, not thrown", async () => {
    enqueue(new TypeError("Network request failed"));
    await expect(apiRequest("/auth/session")).resolves.toEqual({ reached: false });
  });
});

describe("a file upload", () => {
  const FILE = { uri: "file:///cache/a.jpg", field: "file", type: "image/jpeg" };

  test("streams through the native uploader rather than through fetch", async () => {
    enqueue(csrfResponse());
    enqueueUpload({ status: 201, body: JSON.stringify({ data: { url: "/uploads/chat/a.jpg" } }) });

    await apiRequest("/conversations/c1/files", { method: "POST", file: FILE });

    // One fetch, and it is the CSRF pre-flight. The file did not go that way.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_BASE_URL}/csrf`);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].uri).toBe("file:///cache/a.jpg");
    expect(uploads[0].url).toBe(`${API_BASE_URL}/conversations/c1/files`);
  });

  test("sends it under the field name and the type the API reads", async () => {
    enqueue(csrfResponse());
    enqueueUpload({ status: 201, body: JSON.stringify({ data: {} }) });

    await apiRequest("/conversations/c1/files", { method: "POST", file: FILE });

    expect(uploads[0].options).toMatchObject({
      httpMethod: "POST",
      uploadType: MULTIPART,
      fieldName: "file",
      mimeType: "image/jpeg",
    });
  });

  test("declares no Content-Type, so the uploader can name the boundary", async () => {
    enqueue(csrfResponse());
    enqueueUpload({ status: 201, body: JSON.stringify({ data: {} }) });

    await apiRequest("/conversations/c1/files", { method: "POST", file: FILE });

    expect(uploads[0].options.headers).not.toHaveProperty("Content-Type");
  });

  test("carries the Session cookie and the CSRF pair like any other mutation", async () => {
    setSessionCookie(SESSION_COOKIE);
    enqueue(csrfResponse());
    enqueueUpload({ status: 201, body: JSON.stringify({ data: {} }) });

    await apiRequest("/conversations/c1/files", { method: "POST", file: FILE });

    expect(uploads[0].options.headers).toMatchObject({
      Cookie: `${SESSION_COOKIE}; csrf-token=cookie-value`,
      "x-csrf-token": "csrf-token-value",
    });
  });

  test("an upload the API refused as too large is reported, not thrown", async () => {
    enqueue(csrfResponse());
    enqueueUpload({
      status: 413,
      body: JSON.stringify({ statusCode: 413, message: "File too large" }),
    });

    expect(await apiRequest("/conversations/c1/files", { method: "POST", file: FILE })).toEqual({
      reached: true,
      status: 413,
      body: { statusCode: 413, message: "File too large" },
      sessionCookie: null,
      challengeCookie: null,
    });
  });

  test("an answer that is not JSON reads as no body rather than throwing", async () => {
    enqueue(csrfResponse());
    enqueueUpload({ status: 502, body: "<html>Bad Gateway</html>" });

    expect(await apiRequest("/conversations/c1/files", { method: "POST", file: FILE })).toEqual({
      reached: true,
      status: 502,
      body: null,
      sessionCookie: null,
      challengeCookie: null,
    });
  });

  test("a file that could not be read is a request that never arrived", async () => {
    enqueue(csrfResponse());
    enqueueUpload(new Error("File does not exist"));

    await expect(
      apiRequest("/conversations/c1/files", { method: "POST", file: FILE }),
    ).resolves.toEqual({ reached: false });
  });

  /**
   * The whole reason the upload goes through `apiRequest` at all rather than
   * being its own path beside it.
   */
  test("a CSRF refusal refreshes the pair and uploads again, exactly once", async () => {
    enqueue(csrfResponse(), csrfResponse("second-token", "second-cookie"));
    enqueueUpload(
      { status: 403, body: JSON.stringify({ statusCode: 403, code: "csrf_invalid" }) },
      { status: 201, body: JSON.stringify({ data: {} }) },
    );

    const outcome = await apiRequest("/conversations/c1/files", { method: "POST", file: FILE });

    expect(uploads).toHaveLength(2);
    expect(uploads[1].options.headers["x-csrf-token"]).toBe("second-token");
    expect(outcome).toMatchObject({ reached: true, status: 201 });
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

  test("does not replay the body when the refresh itself fails", async () => {
    enqueue(csrfResponse("stale", "stale-cookie"), csrfRefusal(), response(500, null));

    const outcome = await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });

    // One send, not two. A retry with no pair to carry is a guaranteed refusal,
    // so it buys nothing and costs a second delivery of a non-idempotent body —
    // the same harm `isCsrfRefusal` refuses codeless 403s to avoid.
    expect(calls.filter((call) => call.url.endsWith("/auth/login"))).toHaveLength(1);
    expect(outcome).toMatchObject({ status: 403 });
  });

  test("a refusal that survives the retry keeps the API's own words", async () => {
    enqueue(csrfResponse(), csrfRefusal(), csrfResponse("fresh", "fresh-cookie"), csrfRefusal());

    expect(await apiRequest("/auth/logout", { method: "POST" })).toEqual({
      reached: true,
      status: 403,
      body: { statusCode: 403, code: "csrf_invalid", message: "Invalid CSRF token." },
      sessionCookie: null,
      challengeCookie: null,
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

/**
 * The deadline. A request that never answers has to end somewhere, and where it
 * ends decides whether a tunnel signs someone out.
 */
describe("a request that hangs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("is abandoned once the deadline passes", async () => {
    enqueue(HANGS);
    const pending = apiRequest("/auth/session");

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);

    await expect(pending).resolves.toEqual({ reached: false });
  });

  test("is still waiting a moment before the deadline", async () => {
    enqueue(HANGS);
    const settled = watch(apiRequest("/auth/session"));

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 1);

    expect(settled()).toBe(false);
  });

  /**
   * The point of the whole thing. Being abandoned is the network being gone,
   * which says nothing about whether the Session is still good — and
   * `reached: false` is the only shape that cannot be read as a verdict on the
   * credential.
   */
  test("reads exactly as a network error does, and so ends no Session", async () => {
    setSessionCookie(SESSION_COOKIE);

    enqueue(new TypeError("Network request failed"));
    const network = await apiRequest("/conversations");

    enqueue(HANGS);
    const pending = apiRequest("/conversations");
    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    const abandoned = await pending;

    expect(abandoned).toEqual(network);
    expect(saysSessionExpired(abandoned)).toBe(false);
    expect(getSessionCookie()).toBe(SESSION_COOKIE);
  });

  /**
   * The half that does not look like a transport failure and has to be one
   * anyway: a caller must not be able to tell which way a request was abandoned.
   */
  test("a body that stalls after the headers is abandoned as a transport failure", async () => {
    enqueue(stalledBody(200));
    const pending = apiRequest("/conversations");

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);

    await expect(pending).resolves.toEqual({ reached: false });
  });

  test("a body that is merely unparseable still reads as an answer", async () => {
    enqueue(response(502, undefined));
    expect(await apiRequest("/conversations")).toEqual({
      reached: true,
      status: 502,
      body: null,
      sessionCookie: null,
      challengeCookie: null,
    });
  });

  test("the pre-flight is bounded too, so a mutation is not held up by it", async () => {
    enqueue(HANGS, response(200, {}));
    const pending = apiRequest("/auth/logout", { method: "POST" });

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);

    expect(await pending).toMatchObject({ reached: true, status: 200 });
    const sent = calls[calls.length - 1];
    expect(sent.url).toBe(`${API_BASE_URL}/auth/logout`);
    expect(headersOf(sent)["x-csrf-token"]).toBeUndefined();
  });

  test("each request gets its own deadline rather than sharing one clock", async () => {
    enqueue(response(200, { data: 1 }));
    expect(await apiRequest("/conversations")).toMatchObject({ reached: true });

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS * 2);

    enqueue(response(200, { data: 2 }));
    expect(await apiRequest("/conversations")).toMatchObject({ reached: true });
  });

  test("an upload that goes silent is abandoned on the same terms", async () => {
    enqueue(csrfResponse());
    enqueueUpload(HANGS);

    const pending = apiRequest("/conversations/c1/files", {
      method: "POST",
      file: { uri: "file:///cache/a.jpg", field: "file", type: "image/jpeg" },
    });

    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);

    await expect(pending).resolves.toEqual({ reached: false });
  });

  /**
   * Bytes moving is the server still listening. The deadline measures silence,
   * not duration — otherwise fifteen megabytes over a slow connection would be
   * abandoned for the crime of being large.
   */
  test("an upload still moving is not abandoned, however long it takes", async () => {
    enqueue(csrfResponse());
    enqueueUpload(HANGS);

    const settled = watch(
      apiRequest("/conversations/c1/files", {
        method: "POST",
        file: { uri: "file:///cache/big.mp4", field: "file", type: "video/mp4" },
      }),
    );

    // Let the pre-flight settle so the upload is actually under way.
    await jest.advanceTimersByTimeAsync(0);
    expect(uploads).toHaveLength(1);

    for (let elapsed = 0; elapsed < REQUEST_DEADLINE_MS * 4; elapsed += REQUEST_DEADLINE_MS - 1) {
      await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 1);
      uploads[0].options.onProgress?.({ bytesSent: elapsed, totalBytes: 15_000_000 });
    }

    expect(settled()).toBe(false);

    // Then the connection dies mid-file: no more progress, and it gives up.
    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    expect(settled()).toBe(true);
  });
});
