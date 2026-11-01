/**
 * What the code-entry step decides on its own.
 *
 * Split off `lib/auth-machine` at the same seam every other pure module in this
 * app is split at: the machine decides what a settled attempt *meant*, and this
 * decides whether an attempt is worth making and how long the handshake behind
 * it is good for. Nothing here does I/O and nothing here holds the credential.
 * That lives in the machine state and is discarded with it, per
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
 * `invalidCredentialsError()`, so a wrong code and a challenge that has lapsed
 * arrive as the identical response and **the client cannot tell them apart from
 * it**. Either this clock says "sign in again" or nothing ever does.
 */
export const CHALLENGE_LIFETIME_MS = 600_000;

/**
 * The two things that can answer a challenge.
 *
 * A code from the authenticator app, and one of the backup codes handed over
 * when the factor was turned on. Both finish the same handshake with the same
 * challenge cookie and come back with the same session, so the machine does not
 * know which was used. Only the route, the field and the sentences differ, and
 * all three are decided here or by `lib/auth-service` from this name.
 */
export type ChallengeMethod = "totp" | "backup-code";

/** The length every authenticator app mints a TOTP code at. */
const CODE_LENGTH = 6;

const CODE_SHAPE = new RegExp(`^\\d{${CODE_LENGTH}}$`);

/**
 * A backup code as better-auth mints it: ten letters and digits, mixed case,
 * written as two halves of five with a hyphen between.
 * `plugins/two-factor/backup-codes` in the API's better-auth builds them that
 * way and `auth.factory.ts` overrides neither the length nor the amount.
 */
const BACKUP_CODE_SHAPE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

const BACKUP_CODE_WITHOUT_HYPHEN = /^[A-Za-z0-9]{10}$/;

/**
 * An empty field, worded as the instruction it is. "Enter a code" is what
 * somebody who has not typed one yet needs; telling them the code is the wrong
 * length would be a complaint about nothing.
 */
export const CODE_REQUIRED_NOTICE = "Enter the code from your authenticator app.";

export const CODE_SHAPE_NOTICE = `That code should be ${CODE_LENGTH} digits.`;

export const BACKUP_CODE_REQUIRED_NOTICE = "Enter one of your backup codes.";

export const BACKUP_CODE_SHAPE_NOTICE =
  "A backup code is ten letters and numbers, like abcde-12345.";

/**
 * What the person is told when the handshake ran out from under them.
 *
 * Says what to do rather than what happened, because the only way back is the
 * whole sign-in again: the password step mints the challenge, so there is
 * nothing here to retry on its own.
 */
export const CHALLENGE_LAPSED_NOTICE =
  "That took too long to finish, so the sign-in was cancelled. Sign in again.";

/**
 * What the sign-in screen wears while it is asking for each kind of code.
 *
 * `switchLabel` is the control that moves to the *other* method, so it is
 * worded as where it goes rather than as where it is.
 */
export const CHALLENGE_COPY: Record<
  ChallengeMethod,
  {
    title: string;
    description: string;
    fieldLabel: string;
    fieldAccessibilityLabel: string;
    placeholder: string;
    switchLabel: string;
  }
> = {
  totp: {
    title: "Enter your code",
    description: `Open your authenticator app and type the ${CODE_LENGTH}-digit code it is showing.`,
    fieldLabel: "Authentication code",
    fieldAccessibilityLabel: "Authentication code from your authenticator app",
    placeholder: "123456",
    switchLabel: "Use a backup code instead",
  },
  "backup-code": {
    title: "Enter a backup code",
    description:
      "Type one of the backup codes you saved when you turned on two-factor. Each one works once.",
    fieldLabel: "Backup code",
    fieldAccessibilityLabel: "One of your backup codes",
    placeholder: "abcde-12345",
    switchLabel: "Use your authenticator app instead",
  },
};

/**
 * The code as it goes on the wire.
 *
 * Every space, not only the ends, for both methods: AGENTS.md's "allow pasting
 * codes" has to survive an authenticator that displays `123 456` and a person
 * who copies exactly what they can see. The API's `z.strictObject` takes the
 * code and would refuse the rest, which is a rejection nobody could act on.
 *
 * A backup code typed without its hyphen gets it back. better-auth compares the
 * stored codes exactly, so `abcde12345` is refused as a wrong code although the
 * person typed every character right, and the hyphen is the one character a
 * person copying from paper is likely to drop. Case is left alone, because the
 * comparison is exact there too and `aBcDe` is a different code from `abcde`.
 */
export function normaliseCode(typed: string, method: ChallengeMethod): string {
  const code = typed.replace(/\s+/g, "");
  if (method === "backup-code" && BACKUP_CODE_WITHOUT_HYPHEN.test(code)) {
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }
  return code;
}

/**
 * Why this code cannot be sent, or null when it can.
 *
 * The one place this screen judges shape where the password field on the step
 * before deliberately does not. A password that fails today's rules may still be
 * a perfectly good older one, so only the server can rule on it; a TOTP code has
 * exactly one shape and always has, and so does a backup code. Refusing five
 * digits here costs nothing and saves a round trip that could only ever come
 * back refused, and, on an API that rate limits, saves an attempt as well.
 */
export function codeError(typed: string, method: ChallengeMethod): string | null {
  const code = normaliseCode(typed, method);

  if (method === "backup-code") {
    if (code === "") return BACKUP_CODE_REQUIRED_NOTICE;
    return BACKUP_CODE_SHAPE.test(code) ? null : BACKUP_CODE_SHAPE_NOTICE;
  }

  if (code === "") return CODE_REQUIRED_NOTICE;
  return CODE_SHAPE.test(code) ? null : CODE_SHAPE_NOTICE;
}
