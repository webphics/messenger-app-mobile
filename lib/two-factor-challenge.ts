/**
 * What the code-entry step decides on its own.
 *
 * Split off `lib/auth-machine` at the same seam every other pure module in this
 * app is split at: the machine decides what a settled attempt *meant*, and this
 * decides whether an attempt is worth making and how long the handshake behind
 * it is good for. Nothing here does I/O and nothing here holds the credential —
 * that lives in the machine state and is discarded with it, per
 * `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`.
 */

/**
 * How long the challenge this client is holding stays good for.
 *
 * better-auth's `twoFactor` plugin mints `better-auth.two_factor` with
 * `maxAge = options?.twoFactorCookieMaxAge ?? 600`, and
 * `api/src/modules/auth/auth.factory.ts` overrides nothing, so the handshake
 * lives ten minutes and then the cookie is simply no longer accepted.
 *
 * It is a deadline kept on this side rather than a fact read off a refusal, and
 * it has to be. better-auth raises `INVALID_CODE` and
 * `INVALID_TWO_FACTOR_COOKIE` both as UNAUTHORIZED, and
 * `api/src/modules/auth/auth.error.ts` folds every 401 into one
 * `invalidCredentialsError()` — so a wrong code and a challenge that has lapsed
 * arrive as the identical response and **the client cannot tell them apart from
 * it**. Either this clock says "sign in again" or nothing ever does.
 */
export const CHALLENGE_LIFETIME_MS = 600_000;

/** The length every authenticator app mints a TOTP code at. */
const CODE_LENGTH = 6;

const CODE_SHAPE = new RegExp(`^\\d{${CODE_LENGTH}}$`);

/**
 * An empty field, worded as the instruction it is. "Enter a code" is what
 * somebody who has not typed one yet needs; telling them the code is the wrong
 * length would be a complaint about nothing.
 */
export const CODE_REQUIRED_NOTICE = "Enter the code from your authenticator app.";

export const CODE_SHAPE_NOTICE = `That code should be ${CODE_LENGTH} digits.`;

/**
 * What the person is told when the handshake ran out from under them.
 *
 * Says what to do rather than what happened, because the only way back is the
 * whole sign-in again: the password step mints the challenge, so there is
 * nothing here to retry on its own.
 */
export const CHALLENGE_LAPSED_NOTICE =
  "That took too long to finish, so the sign-in was cancelled. Sign in again.";

/** The heading the sign-in screen wears while it is asking for a code. */
export const CHALLENGE_COPY = {
  title: "Enter your code",
  description: `Open your authenticator app and type the ${CODE_LENGTH}-digit code it is showing.`,
};

/**
 * The code as it goes on the wire.
 *
 * Every space, not only the ends: AGENTS.md's "allow pasting codes" has to
 * survive an authenticator that displays `123 456` and a person who copies
 * exactly what they can see. The API's `z.strictObject` takes the digits and
 * would refuse the rest, which is a rejection nobody could act on.
 */
export function normaliseCode(typed: string): string {
  return typed.replace(/\s+/g, "");
}

/**
 * Why this code cannot be sent, or null when it can.
 *
 * The one place this screen judges shape where the password field on the step
 * before deliberately does not. A password that fails today's rules may still be
 * a perfectly good older one, so only the server can rule on it; a TOTP code has
 * exactly one shape and always has. Refusing five digits here costs nothing and
 * saves a round trip that could only ever come back refused — and, on an API
 * that rate limits, saves an attempt as well.
 */
export function codeError(typed: string): string | null {
  const code = normaliseCode(typed);
  if (code === "") return CODE_REQUIRED_NOTICE;

  return CODE_SHAPE.test(code) ? null : CODE_SHAPE_NOTICE;
}

/** Whether the typed code is worth a request. */
export function isSubmittableCode(typed: string): boolean {
  return codeError(typed) === null;
}
