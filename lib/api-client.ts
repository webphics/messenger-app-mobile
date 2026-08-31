import { API_BASE_URL } from "@/lib/api-config";
import type { HttpOutcome } from "@/lib/auth-response";

/**
 * The one place this app talks to the API.
 *
 * Two things live here so that no call site has to remember them. The Bearer
 * credential is attached to every request from a single held token, so a screen
 * asking for data cannot forget to authenticate. And the CSRF pre-flight is
 * confined to the one case that still needs it — see below.
 *
 * Nothing here throws. A request that never got an answer comes back as
 * `{ reached: false }`, which `lib/auth-response` reads as a transport failure.
 */

/** What the API emits when a response established a session. Named by the server; not renamed here. */
const SESSION_TOKEN_HEADER = "set-auth-token";

const CSRF_PATH = "/csrf";
const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let bearerToken: string | null = null;

/** Hold the credential every later request will carry. Null signs the client out. */
export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

export function getBearerToken(): string | null {
  return bearerToken;
}

/**
 * Pull one cookie's value out of a `Set-Cookie` header.
 *
 * React Native joins multiple `Set-Cookie` headers into one comma-separated
 * string, so this has to treat both `,` and `;` as separators and match the name
 * only at a boundary — otherwise `x-csrf-token=…` would satisfy a search for
 * `csrf-token`.
 */
export function readCookieValue(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;

  for (const pair of setCookie.split(/[,;]/)) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;

    const value = pair.slice(separator + 1).trim();
    if (value !== "") return value;
  }

  return null;
}

type CsrfCredential = { token: string; cookie: string };

/**
 * Fetch the double-submit CSRF pair the API's guard wants.
 *
 * Needed for exactly one request in this client: signing in. The guard waives any
 * request carrying `Authorization: Bearer`, which is every authenticated request
 * — but sign-in is the request that obtains the Bearer credential, so it has
 * nothing to present and falls through to the CSRF path. ADR-0004 reads the
 * waiver as removing the pre-flight entirely; it removes it everywhere except
 * here.
 *
 * The cookie is echoed back by hand rather than left to a cookie jar. The API
 * scopes it to `COOKIE_DOMAIN`, which a device reaching a LAN IP or `10.0.2.2`
 * does not match, so a jar would drop it — and relying on a jar at all is what
 * ADR-0004 chose Bearer to avoid.
 */
async function fetchCsrfCredential(): Promise<CsrfCredential | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${CSRF_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const cookie = readCookieValue(response.headers.get("set-cookie"), CSRF_COOKIE);
    const body: unknown = await response.json();
    const token =
      typeof body === "object" && body !== null
        ? (body as { data?: unknown }).data
        : null;

    if (typeof token !== "string" || token === "" || !cookie) return null;
    return { token, cookie };
  } catch {
    return null;
  }
}

/** A body the API did not send as JSON is not worth a crash; the interpreters read null as malformed. */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialised as JSON. Omit for a request with no body. */
  body?: unknown;
  /**
   * Present the given credential instead of the held one.
   *
   * For the single case of signing out, where the credential is deliberately
   * dropped locally *before* the server is told, so a slow logout cannot leave a
   * live token attached to whatever the person does next.
   */
  bearer?: string;
};

/**
 * Send one request to the API and report what came back.
 *
 * `path` is absolute from the API root, e.g. `/auth/login`.
 */
export async function apiRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<HttpOutcome> {
  const method = options.method ?? "GET";
  const credential = options.bearer ?? bearerToken;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (credential) {
    headers.Authorization = `Bearer ${credential}`;
  } else if (!SAFE_METHODS.has(method)) {
    const credential = await fetchCsrfCredential();
    if (credential) {
      headers[CSRF_HEADER] = credential.token;
      headers.Cookie = `${CSRF_COOKIE}=${credential.cookie}`;
    }
    // A pre-flight that failed is not worth short-circuiting: the request still
    // goes, and the guard's own 403 message is more useful than a guess here.
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    return {
      reached: true,
      status: response.status,
      body: await readJsonBody(response),
      sessionToken: response.headers.get(SESSION_TOKEN_HEADER),
    };
  } catch {
    return { reached: false };
  }
}
