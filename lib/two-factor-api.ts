import { asRecord } from "@/lib/api-envelope";
import { readOutcome, type ApiResult } from "@/lib/api-result";
import {
  adoptReplacedSessionCookie,
  authenticatedRequest,
  currentCredentialEpoch,
} from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { getSessionUser, setSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/**
 * Turning two-factor off, and replacing the backup codes, over the one transport
 * this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline. This module adds two paths, not a second way of talking to the API.
 *
 * ## Two routes, and the two that are deliberately absent
 *
 * `POST /auth/two-factor/enable` and `GET /auth/two-factor/get-totp-uri` exist,
 * work, and have no wrapper here. That is ticket 08, which is blocked on
 * `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`:
 * `POST /auth/two-factor/verify-backup-code` carries `@UseGuards(AuthGuard)`, so
 * it resolves a full session, and at challenge time there is none, only the
 * short-lived `better-auth.two_factor` cookie. A backup code is therefore
 * suspected to be unredeemable at the one moment it exists for. Giving this
 * client a way to turn two-factor on while that is true would let somebody turn
 * on a lock and throw away the only spare key, from the device they are most
 * likely to lose. `docs/adr/ADR-0013-the-two-factor-challenge-is-a-machine-state.md`
 * makes it a blocking edge rather than a note. Anybody adding an enable wrapper
 * here is in the wrong ticket.
 *
 * ## Both bodies are strict, and the password is conditional
 *
 * `TwoFactorEnableInputSchema` is a `z.strictObject({ password?: string })` and
 * both routes are validated against it, so an extra key is refused outright
 * rather than ignored. `twoFactorBody` below assembles exactly one of the two
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
    disabled(data) && held ? { ...held, twoFactorEnabled: false } : null,
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
