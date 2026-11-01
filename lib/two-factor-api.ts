import { apiRequest } from "@/lib/api-client";
import { asRecord } from "@/lib/api-envelope";
import { readOutcome, type ApiResult } from "@/lib/api-result";
import { CODE_REFUSED_NOTICE, parseSessionUser } from "@/lib/auth-response";
import {
  adoptReplacedSessionCookie,
  authenticatedRequest,
  currentCredentialEpoch,
} from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { getSessionUser, setSessionUser } from "@/lib/session";
import { normaliseCode } from "@/lib/two-factor-challenge";
import type { SessionUser } from "@/lib/types";

/**
 * Turning two-factor on and off, and replacing the backup codes, over the one
 * transport this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds four paths, not a second way of talking to the API.
 * The one exception is the code that confirms a setup, and it says why.
 *
 * ## Turning it on is two requests, and only the second turns it on
 *
 * `POST /auth/two-factor/enable` mints a secret and a set of backup codes and
 * answers with both, but it does not turn anything on: better-auth stores the
 * factor unverified and flips `twoFactorEnabled` only when the first code from
 * it comes back on `POST /auth/two-factor/verify-totp` under the same session.
 * So setting up is `startTwoFactorSetup` then `confirmTwoFactorSetup`, and a
 * person who walks away between them is left exactly as they were. Starting
 * again overwrites the unverified secret and codes, which is why a fresh start
 * is always safe to offer.
 *
 * This used to be withheld. `POST /auth/two-factor/verify-backup-code` carried
 * `@UseGuards(AuthGuard)`, so a backup code could not be redeemed at challenge
 * time, and turning on a factor whose only recovery was broken would have let
 * somebody throw away the spare key. The API dropped the guard, the sign-in
 * challenge now takes a backup code, and
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`
 * records it run against the API. `GET /auth/two-factor/get-totp-uri` still has
 * no wrapper, because the enable answer already carries the URI.
 *
 * ## The password bodies are strict, and the password is conditional
 *
 * `TwoFactorEnableInputSchema` is a `z.strictObject({ password?: string })` and
 * enable, disable and generate-backup-codes are all validated against it, so an
 * extra key is refused outright rather than ignored. `twoFactorBody` below assembles exactly one of the two
 * shapes for that reason.
 *
 * When the password is needed is `lib/two-factor-management`'s rule, read off
 * `hasPassword`, with the working from better-auth's own `shouldRequirePassword`
 * written out there. This module never decides it, it only sends what it is
 * handed.
 */

const DISABLE_PATH = "/auth/two-factor/disable";
const BACKUP_CODES_PATH = "/auth/two-factor/generate-backup-codes";

/**
 * The body, which is either a password or nothing at all.
 *
 * Nothing at all is a real case rather than a degenerate one: with
 * `allowPasswordless: true` an account that signs in by link or with Google has
 * no password to prove, and `{}` is what the API expects from it. An empty
 * string would be a present-but-empty password and a 400, which is why the
 * absence is expressed by omitting the key rather than by emptying it.
 */
function twoFactorBody(password: string | null): { password?: string } {
  return password === null || password === "" ? {} : { password };
}

/**
 * Whether the API said it actually turned two-factor off.
 *
 * The payload is `{ status: boolean }`, straight from better-auth through the
 * controller's `TwoFactorDisableDataSchema`. A `false` status is the server
 * declining to claim it disabled anything, and treating any 200 as success would
 * leave somebody told their factor is off while it is on, which is the one
 * direction this screen must never be wrong in.
 */
function disabled(data: unknown): boolean {
  return asRecord(data)?.status === true;
}

/**
 * The codes, or null for anything this client cannot read as a usable set.
 *
 * Stricter than the usual list parse, which drops rows it cannot read and keeps
 * the rest. These are shown once and never again, so a half-read set is a
 * recovery path with holes in it that nobody can tell are there, and an empty
 * one is a person handed nothing under a heading promising codes. Reporting
 * `malformed` sends them back to a control they can tap again; silently showing
 * an empty list sends them away believing they have codes.
 */
function parseBackupCodes(data: unknown): string[] | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  if (data.some((code) => typeof code !== "string" || code.trim() === "")) {
    return null;
  }
  return data as string[];
}

/**
 * Turn two-factor off for the account this phone is signed in to.
 *
 * `password` is required in the signature and nullable in its type rather than
 * optional, for `lib/profile-api`'s reason: which of the two bodies goes out is
 * not something a caller should be able to forget. Forgetting it on an account
 * that has a password is a 400 that reads like a bug in the screen, and the
 * caller already has the answer, since `asksForPassword` is what drew the field.
 *
 * ## Why this writes the person, and what it derives
 *
 * The answer carries a status and no user, so the updated person is derived from
 * the held one with the single flag this route can have changed, exactly as
 * `setPassword` derives its own. It can only have changed one way, so nothing
 * else is invented.
 *
 * A held person of null leaves the derivation with nothing to derive from. That
 * is unreachable in practice, because a 200 from a guarded route means there was
 * a session and a session means a held person, and it is reported rather than
 * guessed at, because a guess here would write a stranger into the keystore.
 *
 * Two of the three copies of the signed-in person are written here, the module
 * mirror and the Kept person, for the reason `lib/profile-api` gives at length:
 * a write that updated one of them is a lie the next render tells. The third is
 * the auth state, which no module can reach, so the value is handed back for the
 * caller to pass to `accountUpdated` on `useAuth()`. Without that last step the
 * two-factor row on Settings goes on reporting "on" for a factor that is off.
 */
export async function disableTwoFactor(
  password: string | null,
): Promise<ApiResult<SessionUser>> {
  const startedAt = currentCredentialEpoch();
  const outcome = await authenticatedRequest(DISABLE_PATH, {
    method: "POST",
    body: twoFactorBody(password),
  });

  const held = getSessionUser();
  const result = readOutcome(outcome, (data) =>
    // `removeCredentialAccountAfterTwoFactorDisable` in the API deletes the password with the
    // factor, so a screen still drawing a password field would ask for one that is gone.
    disabled(data) && held ? { ...held, twoFactorEnabled: false, hasPassword: false } : null,
  );

  if (result.ok) {
    // The API ended the session this request carried and answered with its
    // successor. Held before anything else is written, so the next request
    // already carries the cookie that still works.
    await adoptReplacedSessionCookie(outcome, startedAt);
    setSessionUser(result.value);
    await writeKeptPerson(result.value);
  }

  return result;
}

/**
 * Replace this account's backup codes with a fresh set, and hand them back.
 *
 * Nothing is written and nothing about the signed-in person changes: two-factor
 * is on before this and on after it, and the codes themselves are never stored
 * on the device. They exist in this answer, on the screen that drew it, and
 * nowhere else. No route reads them back, which is the whole reason the screen
 * that shows them says so in as many words.
 *
 * Answers `201` rather than `200`, since the controller adds no `@HttpCode` to
 * this one. `readOutcome` takes any 2xx, so that costs nothing here and is noted
 * only because the route beside it does say `200`.
 */
export async function generateBackupCodes(
  password: string | null,
): Promise<ApiResult<string[]>> {
  const outcome = await authenticatedRequest(BACKUP_CODES_PATH, {
    method: "POST",
    body: twoFactorBody(password),
  });

  return readOutcome(outcome, parseBackupCodes);
}

const ENABLE_PATH = "/auth/two-factor/enable";
const SETUP_CONFIRM_PATH = "/auth/two-factor/verify-totp";

/** What an authenticator app needs, and the codes that stand in for it. */
export type TwoFactorSetup = {
  /** The `otpauth://` link an authenticator app on this phone can open. */
  totpURI: string;
  /** The same secret, for somebody typing it into an app by hand. */
  secret: string;
  backupCodes: string[];
};

/**
 * The secret, off the `otpauth://` link.
 *
 * A pattern rather than `URL`, because React Native's `URL` does not reliably
 * read the query of a scheme it does not know, and `otpauth:` is one of those.
 */
function secretOf(totpURI: string): string | null {
  const match = /[?&]secret=([^&]+)/.exec(totpURI);
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * The setup, or null for anything this client cannot use whole.
 *
 * A link with no secret is a factor nobody can add, and a set of codes this
 * could not read is `parseBackupCodes`' reason again: a recovery path with holes
 * in it is worse than being told to try again.
 */
function parseSetup(data: unknown): TwoFactorSetup | null {
  const record = asRecord(data);
  const totpURI = record?.totpURI;
  if (typeof totpURI !== "string" || !totpURI.startsWith("otpauth://")) return null;

  const secret = secretOf(totpURI);
  const backupCodes = parseBackupCodes(record?.backupCodes);
  if (!secret || !backupCodes) return null;

  return { totpURI, secret, backupCodes };
}

/**
 * Mint the secret and backup codes for this account, without turning anything on.
 *
 * The body is the disable route's, so the password rule is the same one:
 * better-auth's `enableTwoFactor` calls the same `shouldRequirePassword` before
 * it does anything. A wrong password is a 400 rather than a 401, so it is an
 * ordinary refusal and never ends the session.
 */
export async function startTwoFactorSetup(
  password: string | null,
): Promise<ApiResult<TwoFactorSetup>> {
  const outcome = await authenticatedRequest(ENABLE_PATH, {
    method: "POST",
    body: twoFactorBody(password),
  });

  return readOutcome(outcome, parseSetup);
}

/**
 * Prove the authenticator was set up, which is the request that turns two-factor on.
 *
 * ## Why this is `apiRequest` rather than `authenticatedRequest`
 *
 * A wrong code here is a 401: better-auth raises `INVALID_CODE` as UNAUTHORIZED
 * and the API folds it into `invalid_credentials`. `authenticatedRequest` reads
 * every 401 as the session ending, so a mistyped digit would sign somebody out
 * halfway through turning on a protection. The route carries no guard, so its
 * 401 is about the code rather than the session. The held Session cookie still
 * goes out, because `apiRequest` attaches it, and that is what tells better-auth
 * this is a setup rather than a sign-in.
 *
 * The cost is one case this cannot tell apart. A session that had already ended
 * also answers 401 here and reads as a refused code; the next authenticated
 * request is what notices the session instead.
 *
 * ## What it writes
 *
 * better-auth ends the session this request carried and answers with its
 * successor, as it does for disable, so the cookie is adopted first. The person
 * is derived from the held one with the single flag this route changed, and
 * only when the answer itself says the factor is on: a 2xx alone is not enough
 * to tell somebody they are protected.
 */
export async function confirmTwoFactorSetup(
  code: string,
): Promise<ApiResult<SessionUser>> {
  const startedAt = currentCredentialEpoch();
  const outcome = await apiRequest(SETUP_CONFIRM_PATH, {
    method: "POST",
    body: { code: normaliseCode(code, "totp") },
  });

  if (outcome.reached && outcome.status === 401) {
    return { ok: false, failure: { kind: "refused", message: CODE_REFUSED_NOTICE } };
  }

  const held = getSessionUser();
  const result = readOutcome(outcome, (data) =>
    parseSessionUser(data)?.twoFactorEnabled === true && held
      ? { ...held, twoFactorEnabled: true }
      : null,
  );

  if (result.ok) {
    await adoptReplacedSessionCookie(outcome, startedAt);
    setSessionUser(result.value);
    await writeKeptPerson(result.value);
  }

  return result;
}
