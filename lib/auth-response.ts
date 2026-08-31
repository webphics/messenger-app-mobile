import type { SessionUser, UserRole } from "@/lib/types";

/**
 * Turning an HTTP answer into an auth fact. Pure, so every branch is a table row
 * rather than a thing you reproduce by unplugging a laptop.
 *
 * The four outcomes the sign-in screen has to tell apart are success, a refusal,
 * a two-factor challenge, and never having heard back at all. A fifth —
 * `malformed` — exists because "the server answered with something this app
 * cannot read" is genuinely none of those: it is not a refusal (the credential
 * may be fine) and not a transport failure (the request arrived).
 */

/** What the transport managed to obtain. `reached: false` is the only shape a thrown fetch produces. */
export type HttpOutcome =
  | {
      reached: true;
      status: number;
      /** Parsed JSON, or null when the body was absent or unparseable. */
      body: unknown;
      /** The `set-auth-token` header, present only when the response issued a credential. */
      sessionToken: string | null;
    }
  | { reached: false };

export type AuthOutcome =
  | { kind: "signed-in"; token: string; user: SessionUser }
  | { kind: "two-factor" }
  /** The credential itself was refused. The only outcome that may erase a stored token. */
  | { kind: "unauthorised"; message: string }
  /** The server answered, but not about this credential — a 500, a 429, a bad request. */
  | { kind: "server-error"; message: string }
  | { kind: "transport-failure" }
  | { kind: "malformed" };

const ROLES: readonly UserRole[] = ["admin", "agent", "customer"];

const DEFAULT_REFUSAL = "Could not sign in. Check your email and password.";

const DEFAULT_SERVER_ERROR = "The server could not handle that right now. Try again.";

/**
 * The statuses that mean *this credential is no good*, as opposed to *the server
 * is having a bad day*.
 *
 * The distinction is not cosmetic: `unauthorised` is what erases a stored Session
 * token, so folding a 500 or a 502 into it would sign someone out because a
 * deploy went wrong — the same wrongful sign-out that Unreachable exists to
 * prevent, arriving by a different door.
 */
const CREDENTIAL_REFUSED = new Set([401, 403]);

/**
 * The API's code for a request the CSRF guard turned away.
 *
 * It arrives as a 403, which would otherwise read as "your credential is no
 * good" — and this app can meet it: the guard waives Bearer requests, so only
 * sign-in is exposed, and only when its pre-flight failed to produce the
 * double-submit pair. Retyping a password cannot fix that, so saying so is the
 * difference between a person retrying usefully and a person retrying forever.
 */
const CSRF_REFUSED_CODE = "csrf_invalid";

const CSRF_MESSAGE =
  "Could not start a secure connection to the server. Check your connection and try again.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The API wraps every payload in an envelope; the part worth reading is `data`. */
function envelopeData(body: unknown): Record<string, unknown> | null {
  const envelope = asRecord(body);
  return envelope ? asRecord(envelope.data) : null;
}

/**
 * The signed-in person, or null when the payload is not one.
 *
 * Only the four fields this client acts on are required. An unknown `role` fails
 * the parse rather than defaulting: guessing would put someone in the wrong Hub,
 * which is the exact failure this whole ticket exists to prevent.
 */
export function parseSessionUser(data: unknown): SessionUser | null {
  const record = asRecord(data);
  if (!record) return null;

  const id = nonEmptyString(record.id);
  const email = nonEmptyString(record.email);
  const role = record.role;
  if (!id || !email) return null;
  if (typeof role !== "string" || !ROLES.includes(role as UserRole)) return null;

  return {
    id,
    // A name is display chrome, not identity — an account without one still signs in.
    name: nonEmptyString(record.name) ?? email,
    email,
    role: role as UserRole,
  };
}

/** True when the payload is the API's two-factor challenge rather than a signed-in person. */
function isTwoFactorChallenge(data: Record<string, unknown> | null): boolean {
  return data?.twoFactorRedirect === true;
}

/** Classify a non-2xx answer, carrying the server's own words so it explains itself. */
function refusal(status: number, body: unknown): AuthOutcome {
  const error = asRecord(body);
  const message = nonEmptyString(error?.message);

  if (error?.code === CSRF_REFUSED_CODE) {
    return { kind: "server-error", message: CSRF_MESSAGE };
  }

  return CREDENTIAL_REFUSED.has(status)
    ? { kind: "unauthorised", message: message ?? DEFAULT_REFUSAL }
    : { kind: "server-error", message: message ?? DEFAULT_SERVER_ERROR };
}

/**
 * Read a `POST /auth/login` response.
 *
 * A success is only a success when a Session token came with it: the API emits
 * `set-auth-token` exactly on responses that established a credential, so a
 * 200-with-a-user-and-no-token is a response this client cannot act on rather
 * than a sign-in it should celebrate.
 */
export function interpretSignIn(outcome: HttpOutcome): AuthOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  const data = envelopeData(outcome.body);

  // Checked before the status class: the challenge arrives as a 200.
  if (isTwoFactorChallenge(data)) return { kind: "two-factor" };

  if (outcome.status < 200 || outcome.status >= 300) {
    return refusal(outcome.status, outcome.body);
  }

  const user = parseSessionUser(data);
  const token = nonEmptyString(outcome.sessionToken);
  if (!user || !token) return { kind: "malformed" };

  return { kind: "signed-in", token, user };
}

/**
 * Read a `GET /auth/session` response for a token this client already holds.
 *
 * The token is passed in rather than read off the response because this endpoint
 * issues no new credential — the one being verified is the one that comes back.
 */
export function interpretSession(outcome: HttpOutcome, token: string): AuthOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  if (outcome.status < 200 || outcome.status >= 300) {
    return refusal(outcome.status, outcome.body);
  }

  const user = parseSessionUser(envelopeData(outcome.body));
  if (!user) return { kind: "malformed" };

  return { kind: "signed-in", token, user };
}
