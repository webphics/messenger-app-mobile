import { File, UploadType } from "expo-file-system";

import { API_BASE_URL } from "@/lib/api-config";
import { asRecord, CSRF_REFUSED_CODE } from "@/lib/api-envelope";
import { appVersionHeaders, readUpdateRefusal, setUpdateState } from "@/lib/app-update";
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
 *
 * A request that is never answered *at all* is one of those. Every round trip
 * made here runs under a Request deadline and is abandoned when it passes, so a
 * screen waiting on the API waits for a bounded time and then shows the failure
 * it already knows how to show. An abandoned request is deliberately the same
 * fact as a dead network and not a 401: silence says nothing about whether the
 * Session is still good, and reading it as an expiry would sign someone out for
 * going into a tunnel. See `REQUEST_DEADLINE_MS`.
 */

/**
 * Better Auth's session cookie, and the name it takes when the API runs with
 * secure cookies — which it does in production and wherever `COOKIE_SECURE` is
 * set, per `auth.factory.ts`. `session-cookie.service.ts` handles both variants
 * on the server for the same reason.
 */
const SESSION_COOKIE = "better-auth.session_token";
const SECURE_COOKIE_PREFIX = "__Secure-";

/**
 * The short-lived cookie better-auth's `twoFactor` plugin sets when a correct
 * password lands on an account that wants a second factor, under the same two
 * names and for the same reason.
 *
 * It is the only thing besides the Session cookie and the CSRF pair this client
 * retains off a response, and it is retained for the length of one handshake.
 * See `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`.
 * Nothing here holds it: unlike the Session cookie there is deliberately no
 * module-level slot for it, because a credential kept in a variable outlives the
 * state it belongs to. It is reported on the outcome and held by the machine
 * state alone.
 */
const TWO_FACTOR_COOKIE = "better-auth.two_factor";

const CSRF_PATH = "/csrf";
const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * How long one round trip may go without a word from the server before it is
 * abandoned.
 *
 * Without a deadline nothing here ever gives up: this runtime's `fetch` has no
 * timeout of its own, so an unanswered request falls through to whatever the
 * platform's socket layer decides — minutes on Android, longer still on a
 * connection that is technically open and silent — and a screen waiting on it
 * waits with it.
 *
 * Fifteen seconds is far beyond the sub-second the API answers a healthy
 * request in, and well short of a person's patience with a screen that is doing
 * nothing.
 */
export const REQUEST_DEADLINE_MS = 15_000;

/** The clock a round trip runs under, as the thing making the request sees it. */
type Deadline = {
  signal: AbortSignal;
  /** Push the deadline back. Bytes moving means this is slow, not hung. */
  extend: () => void;
};

/**
 * Run one round trip under a deadline; anything but an answer is null.
 *
 * The deadline measures *silence*, not duration: `extend` pushes it back, so a
 * transfer still moving bytes is never abandoned for taking a long time. Only
 * the upload path can say anything about that — `fetch` reports nothing until
 * it has an answer — so only the upload path extends it.
 *
 * A wrapper rather than a clock each caller holds, because the timer has to be
 * cleared on every way out, including the ones that throw. A caller that forgot
 * would leave a live abort callback per request for fifteen seconds, which is
 * invisible right up until it is a phone getting warm — and "remember to call
 * `clear`" is a rule better kept by the shape of the code than by a comment.
 */
async function underDeadline<T>(
  run: (deadline: Deadline) => Promise<T>,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    timer = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  };

  arm();

  try {
    return await run({
      signal: controller.signal,
      extend: () => {
        if (timer === null) return;
        clearTimeout(timer);
        arm();
      },
    });
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
}

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

/**
 * The two-factor challenge a response issued, as the `name=value` pair to replay
 * on the verify call.
 *
 * The same shape as `findSessionCookie`, beside it deliberately: both names, the
 * prefixed one first, the pair kept whole so this client never has to know which
 * way the API is running. What differs is how long the answer is worth anything,
 * which is `CHALLENGE_LIFETIME_MS` in `lib/two-factor-challenge` and not a
 * question this module can answer. The cookie's own `Max-Age` is on the header
 * and is deliberately not read, because a client that trusted it would trust a
 * number it has no way to check.
 */
export function findChallengeCookie(setCookie: string | null): string | null {
  for (const name of [
    `${SECURE_COOKIE_PREFIX}${TWO_FACTOR_COOKIE}`,
    TWO_FACTOR_COOKIE,
  ]) {
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
  return underDeadline(async ({ signal }) => {
    const response = await fetch(`${API_BASE_URL}${CSRF_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json", ...appVersionHeaders() },
      credentials: "omit",
      signal,
    });
    if (!response.ok) return null;

    const cookie = readCookieValue(response.headers.get("set-cookie"), CSRF_COOKIE);
    const token = asRecord(await response.json())?.data;

    if (typeof token !== "string" || token === "" || !cookie) return null;
    return { token, cookie };
  });
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
  /** A file to upload as multipart. Mutually exclusive with `body`. */
  file: UploadFile | undefined;
  sessionCookie: string | null;
};

/**
 * One file on this device, and what to call it on the way up.
 *
 * A descriptor rather than the bytes: the file is streamed from disk by the
 * native uploader, so nothing here ever holds fifteen megabytes of video.
 */
export type UploadFile = {
  /** `file:` or `content:` — whatever the picker or the recorder produced. */
  uri: string;
  /** The multipart form field the API reads. */
  field: string;
  /** MIME type, which the API's allowlist is checked against. */
  type: string;
};

/**
 * A body this app can hand `fetch`.
 *
 * A file is deliberately absent: it does not travel this way. This runtime's
 * `fetch` is Expo's, and its `FormData` accepts a string, a `Blob`, or anything
 * with `bytes()` — every one of which is the file already in memory. React
 * Native's old `{ uri, name, type }` part, which streamed, is not one of them.
 * So an upload takes the other path below.
 */
function requestBody(attempt: Attempt): { body?: string } {
  if (attempt.body !== undefined) return { body: JSON.stringify(attempt.body) };
  return {};
}

/** The Session cookie and the CSRF pair, however the request is about to travel. */
function credentialHeaders(attempt: Attempt, csrf: CsrfPair | null): Record<string, string> {
  // The version pair rides on every request so the API can refuse a build it no
  // longer serves; see `lib/app-update`.
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...appVersionHeaders(),
  };
  if (csrf) headers[CSRF_HEADER] = csrf.token;

  // Both halves of the double submit travel in one header, beside the Session
  // cookie, because this client writes the whole header itself.
  const cookies: string[] = [];
  if (attempt.sessionCookie) cookies.push(attempt.sessionCookie);
  if (csrf) cookies.push(`${CSRF_COOKIE}=${csrf.cookie}`);
  if (cookies.length > 0) headers.Cookie = cookies.join("; ");

  return headers;
}

/** A header off a plain record, by a name whose case the platform decides. */
function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

/**
 * One file, uploaded as multipart, streamed from disk by the platform.
 *
 * The native uploader rather than `fetch`, for two reasons. This runtime's
 * `fetch` would have to hold the whole file — and then the whole multipart body
 * around it — in memory, which for the fifteen megabytes the API accepts is a
 * lot to ask of a phone. And it cannot be given a file to stream: Expo's
 * `FormData` takes bytes, not a URI.
 *
 * It is still an `apiRequest`, and that is the point: the Session cookie, the
 * CSRF pair and the one retry are the same ones every other mutation gets,
 * because they are built above this and handed in. Only the transport differs.
 */
async function sendFile(
  attempt: Attempt,
  file: UploadFile,
  headers: Record<string, string>,
): Promise<Answer | null> {
  return underDeadline(async ({ signal, extend }) => {
    const result = await new File(file.uri).upload(`${API_BASE_URL}${attempt.path}`, {
      httpMethod: uploadMethod(attempt.method),
      uploadType: UploadType.MULTIPART,
      fieldName: file.field,
      mimeType: file.type,
      // No Content-Type here: the uploader writes one, and it is the only thing
      // that knows the boundary it generated.
      headers,
      // The uploader takes the signal and rejects on it, so an abandoned upload
      // arrives here as any other failure does.
      signal,
      // And it reports bytes leaving, which is the one place in this client that
      // can tell a slow transfer from a dead one. Fifteen megabytes over a bad
      // connection is a long upload, not a hung one, so every report pushes the
      // deadline back and only silence ends it.
      onProgress: extend,
    });

    return {
      status: result.status,
      // Whole and in hand, so unlike `send` there is no body left to stall on.
      body: parseJson(result.body),
      setCookie: headerValue(result.headers, "set-cookie"),
    };
  });
}

/**
 * The method, as the uploader takes it.
 *
 * It accepts three of the five `apiRequest` does, and an upload is a POST on
 * every path that reaches here. Narrowed rather than asserted: the two that are
 * not POST are passed through, and there is nothing useful to do about a `GET`
 * with a file on it except send the request it obviously meant.
 */
function uploadMethod(method: string): "POST" | "PUT" | "PATCH" {
  return method === "PUT" || method === "PATCH" ? method : "POST";
}

/** A body the API did not send as JSON reads as null, exactly as `readJsonBody` does. */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function send(attempt: Attempt, csrf: CsrfPair | null): Promise<Answer | null> {
  const headers = credentialHeaders(attempt, csrf);
  if (attempt.file) return sendFile(attempt, attempt.file, headers);

  if (attempt.body !== undefined) headers["Content-Type"] = "application/json";

  return underDeadline(async ({ signal }) => {
    const response = await fetch(`${API_BASE_URL}${attempt.path}`, {
      method: attempt.method,
      headers,
      credentials: "omit",
      signal,
      ...requestBody(attempt),
    });

    const body = await readJsonBody(response);

    // The deadline covers the body too, and a body abandoned half-read has to
    // come back as a request that never arrived — not as a malformed answer.
    // `readJsonBody` cannot tell the difference, because it swallows every
    // reason a body would not parse; the signal can. Without this, one of the
    // two ways a request can be abandoned would surface as a state of its own,
    // which is the thing a caller must never have to tell apart.
    if (signal.aborted) return null;

    return {
      status: response.status,
      body,
      setCookie: response.headers.get("set-cookie"),
    };
  });
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
   * A file on this device, for the one endpoint that takes one.
   *
   * Sent as multipart instead of `body` rather than beside it, and streamed from
   * disk rather than read into memory — see `sendFile`. The request is
   * authenticated exactly as every other mutation is.
   */
  file?: UploadFile;
  /**
   * Present the given cookie instead of the held Session one.
   *
   * Two callers, wanting it for opposite reasons. Signing out drops the
   * credential locally *before* the server is told, so that a slow logout cannot
   * leave a live cookie attached to whatever the person does next, and hands the
   * ending one down explicitly. Verifying a two-factor code has no Session
   * cookie to drop. The challenge is the only thing identifying the
   * half-finished sign-in, and this caller presents it through this same slot
   * rather than through a second mechanism, because "which cookie goes out on
   * this request" is one question and deserves one answer.
   */
  cookie?: string;
};

/**
 * Send one request to the API and report what came back.
 *
 * `path` is absolute from the API root, e.g. `/auth/login`.
 *
 * The deadline is per round trip, not per call: the pre-flight, the request and
 * the one retry each get their own, so a slow pre-flight cannot spend the
 * request's chance. The pathological case — every one of them silent — is four
 * deadlines rather than one, and still bounded, which is the property callers
 * need. Per call would be the other trade, and it is the worse one: it abandons
 * a healthy request because the round trip before it was slow.
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
    file: options.file,
    sessionCookie: options.cookie ?? heldSessionCookie,
  };

  // Safe methods are waived by the guard, so a read never pays for a pre-flight.
  const mutation = !SAFE_METHODS.has(method);
  let answer = await send(attempt, mutation ? await ensureCsrfPair() : null);

  // Exactly one retry, and it is one because this is an `if` rather than a loop:
  // a second refusal is returned as it stands.
  if (answer && mutation && isCsrfRefusal(answer)) {
    clearCsrfPair();
    const refreshed = await ensureCsrfPair();

    // Only retry with something to retry *with*. A refetch that failed leaves
    // nothing to carry, and a second send stripped of the pair is the same
    // refusal already in hand — bought at the price of delivering a
    // non-idempotent body twice, which is exactly what `isCsrfRefusal` declines
    // codeless 403s to avoid. The first answer stands.
    if (refreshed) answer = await send(attempt, refreshed);
  }

  if (!answer) return { reached: false };

  // Reported here rather than by each caller, because any request can be the
  // one that learns this build is no longer served. The caller still gets the
  // answer and reads it as the failure it is; the update screen covers it.
  const refusal = readUpdateRefusal(answer.status, answer.body);
  if (refusal) setUpdateState(refusal);

  return {
    reached: true,
    status: answer.status,
    body: answer.body,
    sessionCookie: findSessionCookie(answer.setCookie),
    challengeCookie: findChallengeCookie(answer.setCookie),
  };
}
