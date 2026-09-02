import { API_BASE_URL } from "@/lib/api-config";
import { asRecord, CSRF_REFUSED_CODE } from "@/lib/api-envelope";
import type { HttpOutcome } from "@/lib/auth-response";

/**
 * The one place this app talks to the API.
 *
 * Two things live here so that no call site has to remember them. The Session
 * cookie is attached to every request from a single held value, so a screen
 * asking for data cannot forget to authenticate. And the CSRF pair is fetched
 * once, cached, and replayed on every mutation — the same shape the web client's
 * `lib/client-api.ts` arrived at, and for the same reasons.
 *
 * Cookies are set by hand rather than left to a cookie jar. Every request sets
 * `credentials: "omit"`: React Native's `fetch` is backed by native networking
 * with its own cookie store, and on iOS a manually-set `Cookie` header can be
 * silently overwritten by `NSHTTPCookieStorage`. Omitting credentials takes that
 * store out of the path so the header set here is the header that is sent. It
 * also sidesteps `COOKIE_DOMAIN`, which a device reaching a LAN IP or `10.0.2.2`
 * does not match. See `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`.
 *
 * Nothing here throws. A request that never got an answer comes back as
 * `{ reached: false }`, which `lib/auth-response` reads as a transport failure.
 */

/**
 * Better Auth's session cookie, and the name it takes when the API runs with
 * secure cookies — which it does in production and wherever `COOKIE_SECURE` is
 * set, per `auth.factory.ts`. `session-cookie.service.ts` handles both variants
 * on the server for the same reason.
 */
const SESSION_COOKIE = "better-auth.session_token";
const SECURE_COOKIE_PREFIX = "__Secure-";

const CSRF_PATH = "/csrf";
const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let heldSessionCookie: string | null = null;

/** Hold the credential every later request will carry. Null signs the client out. */
export function setSessionCookie(cookie: string | null): void {
  heldSessionCookie = cookie;
}

export function getSessionCookie(): string | null {
  return heldSessionCookie;
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

/**
 * The Session cookie a response established, as the `name=value` pair to replay.
 *
 * The name is kept rather than reduced to the value because the API decides it:
 * `__Secure-` is prepended whenever it runs with secure cookies, and replaying
 * the pair verbatim means this client never has to know which it is running
 * against.
 */
export function findSessionCookie(setCookie: string | null): string | null {
  for (const name of [`${SECURE_COOKIE_PREFIX}${SESSION_COOKIE}`, SESSION_COOKIE]) {
    const value = readCookieValue(setCookie, name);
    if (value) return `${name}=${value}`;
  }

  return null;
}

type CsrfPair = { token: string; cookie: string };

let heldCsrf: CsrfPair | null = null;
let csrfInFlight: Promise<CsrfPair | null> | null = null;

/**
 * Fetch the double-submit pair the API's guard wants.
 *
 * `csrf.service.ts` configures `doubleCsrf` with a constant session identifier,
 * so the pair is not bound to anyone — one is fetched, cached, and reused until
 * the API rejects it.
 */
async function fetchCsrfPair(): Promise<CsrfPair | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${CSRF_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok) return null;

    const cookie = readCookieValue(response.headers.get("set-cookie"), CSRF_COOKIE);
    const token = asRecord(await response.json())?.data;

    if (typeof token !== "string" || token === "" || !cookie) return null;
    return { token, cookie };
  } catch {
    return null;
  }
}

/** The cached pair, fetching one if there is none. Concurrent mutations share a single fetch. */
async function ensureCsrfPair(): Promise<CsrfPair | null> {
  if (heldCsrf) return heldCsrf;

  csrfInFlight ??= fetchCsrfPair().finally(() => {
    csrfInFlight = null;
  });

  heldCsrf = await csrfInFlight;
  return heldCsrf;
}

/**
 * Drop the cached pair.
 *
 * Keeping it across a sign-out would work — it is not bound to a session. It is
 * dropped anyway so that nothing fetched while one person was signed in is still
 * held while the next one signs in, at the cost of one `GET /csrf` on the way out.
 */
export function clearCsrfPair(): void {
  heldCsrf = null;
  csrfInFlight = null;
}

/** A body the API did not send as JSON is not worth a crash; the interpreters read null as malformed. */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** One round trip, already read to the end. Null is a request that never got an answer. */
type Answer = { status: number; body: unknown; setCookie: string | null };

type Attempt = {
  path: string;
  method: string;
  body: unknown;
  sessionCookie: string | null;
};

async function send(attempt: Attempt, csrf: CsrfPair | null): Promise<Answer | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (attempt.body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf) headers[CSRF_HEADER] = csrf.token;

  // Both halves of the double submit travel in one header, beside the Session
  // cookie, because this client writes the whole header itself.
  const cookies: string[] = [];
  if (attempt.sessionCookie) cookies.push(attempt.sessionCookie);
  if (csrf) cookies.push(`${CSRF_COOKIE}=${csrf.cookie}`);
  if (cookies.length > 0) headers.Cookie = cookies.join("; ");

  try {
    const response = await fetch(`${API_BASE_URL}${attempt.path}`, {
      method: attempt.method,
      headers,
      credentials: "omit",
      ...(attempt.body === undefined ? {} : { body: JSON.stringify(attempt.body) }),
    });

    return {
      status: response.status,
      body: await readJsonBody(response),
      setCookie: response.headers.get("set-cookie"),
    };
  } catch {
    return null;
  }
}

/**
 * Whether a 403 is the CSRF guard's own refusal, and so one a fresh token fixes.
 *
 * The code is required rather than merely not-contradicted. Every 403 the API
 * raises carries one — `invalidCsrfError()` is `forbiddenError('csrf_invalid', …)`
 * — so a 403 without one came from somewhere else entirely, a proxy or a gateway,
 * where a new token changes nothing. Retrying those would replay the request
 * body, which for a non-idempotent mutation means sending it twice to buy a
 * retry that was never going to work.
 *
 * A 403 with any other code — an unverified email, a role that is not allowed —
 * is a verdict on the person rather than on the token, and is likewise left alone.
 */
function isCsrfRefusal(answer: Answer): boolean {
  return answer.status === 403 && asRecord(answer.body)?.code === CSRF_REFUSED_CODE;
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialised as JSON. Omit for a request with no body. */
  body?: unknown;
  /**
   * Present the given Session cookie instead of the held one.
   *
   * For the single case of signing out, where the credential is deliberately
   * dropped locally *before* the server is told, so a slow logout cannot leave a
   * live cookie attached to whatever the person does next.
   */
  cookie?: string;
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
  const attempt: Attempt = {
    path,
    method,
    body: options.body,
    sessionCookie: options.cookie ?? heldSessionCookie,
  };

  // Safe methods are waived by the guard, so a read never pays for a pre-flight.
  const mutation = !SAFE_METHODS.has(method);
  let answer = await send(attempt, mutation ? await ensureCsrfPair() : null);

  // Exactly one retry, and it is one because this is an `if` rather than a loop:
  // a second refusal is returned as it stands.
  if (answer && mutation && isCsrfRefusal(answer)) {
    clearCsrfPair();
    answer = await send(attempt, await ensureCsrfPair());
  }

  if (!answer) return { reached: false };

  return {
    reached: true,
    status: answer.status,
    body: answer.body,
    sessionCookie: findSessionCookie(answer.setCookie),
  };
}
