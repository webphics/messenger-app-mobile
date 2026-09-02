import { asRecord, CSRF_REFUSED_CODE } from "@/lib/api-envelope";
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
      /** The Session cookie the response set, as a `name=value` pair. Null when it set none. */
      sessionCookie: string | null;
    }
  | { reached: false };

/**
 * What asking for a magic link came back as.
 *
 * Not an `AuthOutcome`: nothing here establishes or refuses a credential, so
 * none of it belongs in the auth state machine. Requesting a link is a message
 * being sent, and the only three answers are that it went, that the server said
 * no, and that nobody heard back.
 *
 * There is deliberately no outcome for *this address has no account*. The API
 * answers a first-time email exactly as it answers a known one — verifying the
 * link is what creates the Customer account — and anything here that could tell
 * them apart would turn a sign-in form into a way of asking who has an account.
 */
export type MagicLinkRequestOutcome =
  | { kind: "sent" }
  | { kind: "refused"; message: string }
  | { kind: "transport-failure" };

export type AuthOutcome =
  | { kind: "signed-in"; cookie: string; user: SessionUser }
  | { kind: "two-factor" }
  /** The credential itself was refused. The only outcome that may erase a stored cookie. */
  | { kind: "unauthorised"; message: string }
  /** The server answered, but not about this credential — a 500, a 429, a bad request. */
  | { kind: "server-error"; message: string }
  | { kind: "transport-failure" }
  | { kind: "malformed" };

const ROLES: readonly UserRole[] = ["admin", "agent", "customer"];

const DEFAULT_REFUSAL = "Could not sign in. Check your email and password.";

/**
 * The same job as `DEFAULT_REFUSAL`, for the half of sign-in where nothing was
 * typed. Telling someone to check their password after they tapped a link would
 * point them at a credential this path does not use.
 *
 * Exported because the verification screen needs the same backstop for a
 * refusal that reached it without a message, and two near-identical sentences —
 * one shadowing the other depending on which module got there first — is how a
 * product ends up saying two things about one event.
 */
export const LINK_REFUSED_NOTICE =
  "This sign-in link could not be verified. Request a new one.";

const DEFAULT_SERVER_ERROR = "The server could not handle that right now. Try again.";

/** What to say when the server turned a link request away without saying why. */
const DEFAULT_LINK_REQUEST_REFUSAL =
  "Could not send a sign-in link right now. Try again in a moment.";

/**
 * The statuses that mean *this credential is no good*, as opposed to *the server
 * is having a bad day*.
 *
 * The distinction is not cosmetic: `unauthorised` is what erases a stored Session
 * cookie, so folding a 500 or a 502 into it would sign someone out because a
 * deploy went wrong — the same wrongful sign-out that Unreachable exists to
 * prevent, arriving by a different door.
 */
const CREDENTIAL_REFUSED = new Set([401, 403]);

/**
 * A CSRF refusal arrives as a 403, which would otherwise read as "your credential
 * is no good". `lib/api-client` already refreshes the pair and retries once, so a
 * refusal that reaches here survived that — the pre-flight itself is failing.
 * Retyping a password cannot fix that, so saying so is the difference between a
 * person retrying usefully and a person retrying forever.
 */
const CSRF_MESSAGE =
  "Could not start a secure connection to the server. Check your connection and try again.";

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
function refusal(
  status: number,
  body: unknown,
  defaultRefusal = DEFAULT_REFUSAL,
): AuthOutcome {
  const error = asRecord(body);
  const message = nonEmptyString(error?.message);

  if (error?.code === CSRF_REFUSED_CODE) {
    return { kind: "server-error", message: CSRF_MESSAGE };
  }

  return CREDENTIAL_REFUSED.has(status)
    ? { kind: "unauthorised", message: message ?? defaultRefusal }
    : { kind: "server-error", message: message ?? DEFAULT_SERVER_ERROR };
}

/**
 * Read a response that was supposed to establish a session.
 *
 * A success is only a success when a Session cookie came with it: the API sets
 * one exactly on responses that established a credential, so a
 * 200-with-a-user-and-no-cookie is a response this client cannot act on rather
 * than a sign-in it should celebrate.
 *
 * Shared by the two ways in, because the API answers them with the same shape:
 * `POST /auth/login` and `GET /auth/magic-link/verify` both return the user in
 * an envelope, both set the cookie in a header, and both raise the two-factor
 * challenge as a 200. Only the words for an unexplained refusal differ, since
 * one path has a password to check and the other does not.
 */
function interpretIssuedSession(
  outcome: HttpOutcome,
  defaultRefusal: string,
): AuthOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  const data = envelopeData(outcome.body);

  // Checked before the status class: the challenge arrives as a 200.
  if (isTwoFactorChallenge(data)) return { kind: "two-factor" };

  if (outcome.status < 200 || outcome.status >= 300) {
    return refusal(outcome.status, outcome.body, defaultRefusal);
  }

  const user = parseSessionUser(data);
  const cookie = nonEmptyString(outcome.sessionCookie);
  if (!user || !cookie) return { kind: "malformed" };

  return { kind: "signed-in", cookie, user };
}

/** Read a `POST /auth/login` response. */
export function interpretSignIn(outcome: HttpOutcome): AuthOutcome {
  return interpretIssuedSession(outcome, DEFAULT_REFUSAL);
}

/**
 * Read a `GET /auth/magic-link/verify` response.
 *
 * Every way this can end is already an `AuthOutcome`, which is the point: a
 * verified link is the same fact as an accepted password, so it reaches the auth
 * state machine through the events that were already there rather than through a
 * second seam. An account with two-factor enabled is refused here for the same
 * reason it is refused on the password path — the API's two-factor hook fires on
 * this route too, so the challenge arrives and this client has nowhere to take it.
 *
 * The API cannot tell an expired link from an already-used one — both are a
 * token that is no longer good — and answers both with `invalid_magic_link` and
 * one sentence covering the two. Carried through verbatim, because inventing a
 * distinction the server did not make would be a guess shown as a fact.
 */
export function interpretMagicLinkVerify(outcome: HttpOutcome): AuthOutcome {
  return interpretIssuedSession(outcome, LINK_REFUSED_NOTICE);
}

/**
 * Read a `POST /auth/magic-link` response.
 *
 * The envelope's `data` is the API's own `status` for the request, and a 2xx
 * alone is not enough: a `false` there is the server declining to claim it
 * accepted the request, which is not something to answer with a confirmation
 * naming an address.
 *
 * It is worth being exact about how much `true` promises, because it is less
 * than it looks. The API hands the mail off fire-and-forget — `sendMagicLink`
 * in `auth.factory.ts` catches and logs its own failure — so `true` means the
 * link was minted and handed to the mailer, not that anything was delivered.
 * Nothing better exists to ask for, and the screen's answer is worded to match:
 * it says where a link was sent, and offers another, rather than promising one
 * has arrived.
 */
export function interpretMagicLinkRequest(
  outcome: HttpOutcome,
): MagicLinkRequestOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  if (outcome.status < 200 || outcome.status >= 300) {
    const error = asRecord(outcome.body);
    const code = error?.code;
    const message = nonEmptyString(error?.message);

    return {
      kind: "refused",
      message:
        code === CSRF_REFUSED_CODE
          ? CSRF_MESSAGE
          : (message ?? DEFAULT_LINK_REQUEST_REFUSAL),
    };
  }

  return asRecord(outcome.body)?.data === true
    ? { kind: "sent" }
    : { kind: "refused", message: DEFAULT_LINK_REQUEST_REFUSAL };
}

/**
 * Read a `GET /auth/session` response for a cookie this client already holds.
 *
 * The cookie is passed in rather than read off the response because this endpoint
 * issues no new credential — the one being verified is the one that comes back.
 */
export function interpretSession(outcome: HttpOutcome, cookie: string): AuthOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  if (outcome.status < 200 || outcome.status >= 300) {
    return refusal(outcome.status, outcome.body);
  }

  const user = parseSessionUser(envelopeData(outcome.body));
  if (!user) return { kind: "malformed" };

  return { kind: "signed-in", cookie, user };
}

/**
 * Whether an authenticated request's answer says the Session cookie is no longer
 * accepted — the mid-session half of `#20`, where nobody typed anything and the
 * only thing that changed is that seven days went by.
 *
 * Only a 401, and deliberately narrower than `CREDENTIAL_REFUSED` above. That set
 * serves the sign-in and session endpoints, where a 403 can only be about the
 * credential being presented. On an ordinary authenticated request it is not: a
 * role that may not touch this route, an unverified email, and the CSRF guard's
 * own refusal all arrive as 403, and signing someone out for any of them would
 * end a perfectly good session over a request they were never allowed to make.
 *
 * A request that never got an answer is not here at all, which is the line #19
 * drew and this must not blur: unauthorised clears the cookie, a dead network
 * does not.
 */
export function saysSessionExpired(outcome: HttpOutcome): boolean {
  return outcome.reached && outcome.status === 401;
}
