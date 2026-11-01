import { asRecord, CSRF_REFUSED_CODE } from "@/lib/api-envelope";
import { parseCapabilities } from "@/lib/capabilities";
import type { ChallengeMethod } from "@/lib/two-factor-challenge";
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
      /**
       * The two-factor challenge the response set, as a `name=value` pair. Null
       * when it set none, which is every response but the one that raises the
       * challenge.
       *
       * Optional rather than required, deliberately. Dozens of tests across this
       * repo build an `HttpOutcome` literal out of the four fields above, and
       * none of them is about two-factor. A required fifth field would fail
       * every one of them to make a point that belongs to one code path.
       * Missing and null therefore mean the same thing here, and nothing reads
       * the difference.
       */
      challengeCookie?: string | null;
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

/**
 * What `POST /auth/sign-up` came back as.
 *
 * Unlike a link request, this one is allowed to say an address or a username is
 * taken: the sign-up form has to tell the person, and the API rate limits the
 * route per address for that reason (`docs/api/auth.md`). Each gets its own
 * outcome so the form can put it on the field it is about.
 */
export type SignUpOutcome =
  | { kind: "sent" }
  | { kind: "username-taken"; message: string }
  | { kind: "email-taken"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "transport-failure" };

export type AuthOutcome =
  | { kind: "signed-in"; cookie: string; user: SessionUser }
  /**
   * The credential was right and the account wants a code from an authenticator
   * as well.
   *
   * `challenge` is the short-lived `better-auth.two_factor` cookie, as the
   * `name=value` pair to present on `POST /auth/two-factor/verify-totp`. It is
   * the whole of what this client holds between the two halves of the
   * handshake: it travels in the machine state, is never written to the
   * keychain, and is never held as the Session cookie. See
   * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`.
   */
  | { kind: "two-factor"; challenge: string }
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

/**
 * What to say when the server refused a Google identity without saying why.
 *
 * Worded so it does not send anyone back to a control that cannot help. There is
 * no password on this path to check and no link to request again, so the useful
 * next move is a different account or a different method — retrying the same
 * Google account against the same server will be refused again.
 */
export const GOOGLE_REFUSED_NOTICE =
  "That Google account was not accepted. Try another account, or sign in with your email.";

/** `GOOGLE_REFUSED_NOTICE`, for an Apple ID: nobody typed anything to check. */
export const APPLE_REFUSED_NOTICE =
  "That Apple ID was not accepted. Try again, or sign in with your email.";

/**
 * What to say when a two-factor code is refused.
 *
 * Unlike the two notices above this one is not merely a backstop. It replaces
 * whatever the server said, which `interpretTwoFactorVerify` is the only
 * function in this module to do. The API folds every 401 into
 * `invalidCredentialsError()`, whose sentence names a username, an email and a
 * password, and none of those is the control anybody was looking at. Carrying it
 * through would send somebody back to a password they already typed correctly.
 *
 * It also has to cover the case the client cannot see: an expired challenge
 * comes back as the same 401 as a wrong code, because better-auth raises
 * `INVALID_CODE` and `INVALID_TWO_FACTOR_COOKIE` alike as UNAUTHORIZED. "The
 * current code" is therefore the most this can honestly say. The lapse is
 * announced by the clock in `lib/two-factor-challenge` instead.
 */
export const CODE_REFUSED_NOTICE =
  "That code was not accepted. Check your authenticator app and enter the code it is showing now.";

/**
 * `CODE_REFUSED_NOTICE`, for a backup code.
 *
 * Its own sentence because the likely reasons are different ones: a backup code
 * works once, so the commonest refusal is a code already spent, and telling
 * somebody to look at an authenticator they may not have is the opposite of
 * help. The same 401 covers a lapsed challenge here too, so this says no more
 * about the cause than the other one does.
 */
export const BACKUP_CODE_REFUSED_NOTICE =
  "That backup code was not accepted. Check it, and use one you have not used before.";

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

/** The API's code for a session refused because its account is banned (`BannedUserInterceptor`). */
const BANNED_CODE = "user_banned";

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
 * Only the three fields this client acts on are required, being the id, the
 * address and the role. An unknown `role` fails the parse rather than
 * defaulting: guessing would put someone in the wrong Hub, which is the exact
 * failure this whole ticket exists to prevent.
 *
 * `hasPassword` and `twoFactorEnabled` are the exception to that strictness, and
 * deliberately so. They gate the account screens' controls rather than deciding
 * who anybody is, so a field this client did not receive falls back to false,
 * which hides a control. The other way round would draw one that acts on an
 * assumption the payload never made. See
 * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`.
 * `supportAssignmentEnabled` defaults the same way, and so does `capabilities`,
 * which reads as holding nothing when it is missing or not a list.
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
    // `=== true` rather than truthiness: a string, a 1 or an object would all
    // pass a loose check and every one of them is a payload this client did not
    // understand, which is the case the false default exists for.
    hasPassword: record.hasPassword === true,
    twoFactorEnabled: record.twoFactorEnabled === true,
    // The same default, for the same reason: anything but `true` is a Shared
    // queue, which offers nobody an action the API would refuse.
    supportAssignmentEnabled: record.supportAssignmentEnabled === true,
    capabilities: parseCapabilities(record.capabilities),
    // Absent reads as not accepted: the terms screen asks once more, which is
    // a smaller failure than letting somebody past a step App Review requires.
    termsAcceptedAt: nonEmptyString(record.termsAcceptedAt) ?? null,
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
  if (isTwoFactorChallenge(data)) {
    const challenge = nonEmptyString(outcome.challengeCookie);

    // A handshake this client holds no credential for is not a handshake. The
    // challenge cookie is the only thing identifying the half-finished sign-in
    // to `POST /auth/two-factor/verify-totp`, so a challenge that arrived
    // without one cannot be answered by anything anyone types. That is
    // `malformed` and not a refusal: the credential was accepted, and what
    // cannot be acted on is the server's answer about it.
    return challenge ? { kind: "two-factor", challenge } : { kind: "malformed" };
  }

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
 * Read a `POST /auth/google` response.
 *
 * The API answers this route with the same shape as `POST /auth/login` — the
 * user in an envelope, the Session cookie in a header, the two-factor challenge
 * as a 200 — because on the server both go through Better Auth and come back
 * through `readAuthResponseHeaders`. So it is the same interpreter, and Google
 * reaches the auth state machine through the events that were already there.
 *
 * Two-factor is not a special case here and must not become one: the API's
 * two-factor hook fires on Google sign-in exactly as it does on a password, so
 * an account with it enabled is refused with the same sentence rather than being
 * quietly waved through a door the password path keeps shut.
 *
 * Only the backstop sentence differs, because a refusal here is not about a
 * password anyone typed — nobody typed anything.
 */
export function interpretGoogleSignIn(outcome: HttpOutcome): AuthOutcome {
  return interpretIssuedSession(outcome, GOOGLE_REFUSED_NOTICE);
}

/**
 * Read a `POST /auth/apple` response. The same route shape as Google's, through
 * the same interpreter and with the same two-factor stance; only the backstop
 * sentence names Apple.
 */
export function interpretAppleSignIn(outcome: HttpOutcome): AuthOutcome {
  return interpretIssuedSession(outcome, APPLE_REFUSED_NOTICE);
}

/**
 * Read a `POST /auth/two-factor/verify-totp` or
 * `POST /auth/two-factor/verify-backup-code` response.
 *
 * The same interpreter as the three ways in, because the API answers this route
 * with the same shape: the user in an envelope, the Session cookie in a header.
 * It answers 201 rather than 200, which costs nothing here.
 * `interpretIssuedSession` asks whether the status is a success rather than
 * which success it is.
 *
 * The refusal is the one part that cannot be shared, and it is replaced rather
 * than defaulted: see `CODE_REFUSED_NOTICE` for why the server's own words are
 * the wrong ones on these routes alone. Which sentence replaces them is the
 * method's, since the two codes are refused for different reasons. A
 * `server-error` still speaks for itself,
 * because a 429 or a 500 is about the server rather than about the code, and a
 * CSRF refusal keeps the sentence that tells somebody retyping cannot fix it.
 */
export function interpretTwoFactorVerify(
  outcome: HttpOutcome,
  method: ChallengeMethod,
): AuthOutcome {
  const refused = method === "backup-code" ? BACKUP_CODE_REFUSED_NOTICE : CODE_REFUSED_NOTICE;
  const result = interpretIssuedSession(outcome, refused);

  return result.kind === "unauthorised" ? { kind: "unauthorised", message: refused } : result;
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

const USERNAME_TAKEN_CODE = "username_already_exists";
const EMAIL_TAKEN_CODE = "email_already_exists";

/** Read a `POST /auth/sign-up` answer. The same shape as a link request, plus the two clashes. */
export function interpretSignUp(outcome: HttpOutcome): SignUpOutcome {
  if (!outcome.reached) return { kind: "transport-failure" };

  if (outcome.status < 200 || outcome.status >= 300) {
    const error = asRecord(outcome.body);
    const code = error?.code;
    const message = nonEmptyString(error?.message);

    if (code === USERNAME_TAKEN_CODE) {
      return { kind: "username-taken", message: "This username is taken. Try another one." };
    }

    if (code === EMAIL_TAKEN_CODE) {
      return {
        kind: "email-taken",
        message: "An account already uses this email. Go back and sign in with it.",
      };
    }

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

  // A 403 on this route is a verdict on the credential only when the API says
  // so. The one 403 it raises for a session is a banned account; any other — a
  // proxy, a firewall, a gateway answering for a server it could not reach —
  // says nothing about the cookie, and erasing it signed people out at launch.
  if (outcome.status === 403 && asRecord(outcome.body)?.code !== BANNED_CODE) {
    const message = nonEmptyString(asRecord(outcome.body)?.message);
    return { kind: "server-error", message: message ?? DEFAULT_SERVER_ERROR };
  }

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

/**
 * Whether the API refused a request because this person has not agreed to the
 * Terms of Use (App Store guideline 1.2). A 403 with that code and nothing
 * else: every other 403 is a verdict on the request, and the session is fine
 * either way, so this never ends it — it sends the person to agree.
 */
export function saysTermsRequired(outcome: HttpOutcome): boolean {
  if (!outcome.reached || outcome.status !== 403) return false;
  const body = outcome.body;
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === "terms_required";
}
