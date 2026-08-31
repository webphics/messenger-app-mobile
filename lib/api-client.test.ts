import { API_BASE_URL } from "@/lib/api-config";
import {
  apiRequest,
  getBearerToken,
  readCookieValue,
  setBearerToken,
} from "@/lib/api-client";

type FetchCall = { url: string; init: RequestInit };

const calls: FetchCall[] = [];

/**
 * Responses this test wants, in order. Queued rather than stubbed per-call with
 * `mockResolvedValueOnce`, because a sign-in makes two requests — the CSRF
 * pre-flight and the sign-in itself — and a once-stub would silently be consumed
 * by the first of them.
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

function csrfResponse(): Response {
  return response(
    200,
    { statusCode: 200, message: "Success", data: "csrf-token-value" },
    { "set-cookie": "csrf-token=cookie-value; Path=/; HttpOnly; SameSite=Lax" },
  );
}

function headersOf(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

beforeEach(() => {
  calls.length = 0;
  queue = [];
  setBearerToken(null);
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

describe("the held credential", () => {
  test("round-trips and can be cleared", () => {
    expect(getBearerToken()).toBeNull();
    setBearerToken("held");
    expect(getBearerToken()).toBe("held");
    setBearerToken(null);
    expect(getBearerToken()).toBeNull();
  });
});

describe("apiRequest", () => {
  test("targets the configured base URL", async () => {
    await apiRequest("/auth/session");
    expect(calls[0].url).toBe(`${API_BASE_URL}/auth/session`);
  });

  test("attaches the Bearer credential without the call site asking", async () => {
    setBearerToken("held-token");
    await apiRequest("/auth/session");
    expect(headersOf(calls[0]).Authorization).toBe("Bearer held-token");
  });

  test("attaches it to mutations too, and skips the CSRF pre-flight for them", async () => {
    setBearerToken("held-token");
    await apiRequest("/auth/logout", { method: "POST" });
    expect(calls).toHaveLength(1);
    expect(headersOf(calls[0]).Authorization).toBe("Bearer held-token");
    expect(headersOf(calls[0])["x-csrf-token"]).toBeUndefined();
  });

  test("an explicit bearer is presented even when none is held", async () => {
    await apiRequest("/auth/logout", { method: "POST", bearer: "captured-token" });
    expect(calls).toHaveLength(1);
    expect(headersOf(calls[0]).Authorization).toBe("Bearer captured-token");
    // Authenticated, so the CSRF guard waives it and no pre-flight is needed.
    expect(headersOf(calls[0])["x-csrf-token"]).toBeUndefined();
  });

  test("an explicit bearer overrides the held one", async () => {
    setBearerToken("held-token");
    await apiRequest("/auth/logout", { method: "POST", bearer: "captured-token" });
    expect(headersOf(calls[0]).Authorization).toBe("Bearer captured-token");
  });

  test("sends no Authorization header when there is no credential", async () => {
    await apiRequest("/auth/session");
    expect(headersOf(calls[0]).Authorization).toBeUndefined();
  });

  test("serialises a JSON body and declares its type", async () => {
    setBearerToken("held-token");
    await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });
    expect(calls[0].init.body).toBe('{"email":"a@b.co"}');
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json");
  });

  test("reads the Session token off the response, case-insensitively", async () => {
    enqueue(
      csrfResponse(),
      response(200, { data: {} }, { "Set-Auth-Token": "issued-token" }),
    );
    const outcome = await apiRequest("/auth/login", { method: "POST" });
    expect(outcome).toMatchObject({ reached: true, sessionToken: "issued-token" });
  });

  test("reports the status and parsed body", async () => {
    enqueue(response(401, { message: "Invalid email or password." }));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 401,
      body: { message: "Invalid email or password." },
      sessionToken: null,
    });
  });

  test("a body that is not JSON reads as no body rather than throwing", async () => {
    enqueue(response(502, undefined));
    expect(await apiRequest("/auth/session")).toEqual({
      reached: true,
      status: 502,
      body: null,
      sessionToken: null,
    });
  });

  test("a request that never got an answer is reported, not thrown", async () => {
    enqueue(new TypeError("Network request failed"));
    await expect(apiRequest("/auth/session")).resolves.toEqual({ reached: false });
  });
});

describe("the CSRF pre-flight", () => {
  test("an unauthenticated mutation fetches the pair and presents both halves", async () => {
    enqueue(csrfResponse());
    await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.co" } });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(`${API_BASE_URL}/csrf`);

    const headers = headersOf(calls[1]);
    expect(headers["x-csrf-token"]).toBe("csrf-token-value");
    expect(headers.Cookie).toBe("csrf-token=cookie-value");
  });

  test("an unauthenticated read needs no pre-flight", async () => {
    await apiRequest("/csrf");
    expect(calls).toHaveLength(1);
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
