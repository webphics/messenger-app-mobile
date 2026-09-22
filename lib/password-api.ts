import { readOutcome, type ApiResult } from "@/lib/api-result";
import { parseSessionUser } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { getSessionUser, setSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/**
 * Setting a first password and changing an existing one, over the one transport
 * this app has.
 *
 * `authenticatedRequest` like every other family, so the Session cookie and the
 * CSRF pair are handled exactly as they are everywhere else, a cookie the server
 * has stopped accepting ends the session once rather than at this call site, and
 * a request that hangs ends as an ordinary transport failure on the same
 * deadline.
 *
 * Two routes rather than one, because the API has two and they differ in the
 * only way that matters: `POST /auth/change-password` proves the current
 * password and `POST /auth/set-password` has none to prove. Which of them a
 * person is on is `lib/password-rules`' answer, read off `hasPassword`, and this
 * module never chooses.
 *
 * Both bodies are a `z.strictObject`, so an extra key is refused outright rather
 * than ignored. `PasswordSubmission` in `lib/password-rules` is assembled to be
 * exactly one of the two shapes for that reason, and these two functions take
 * their fields apart rather than spreading whatever they were handed.
 *
 * ## Why both of these write to three places
 *
 * `lib/profile-api` has the long version and it applies here word for word: the
 * signed-in person is held in the auth state, in this module's mirror
 * (`lib/session`), and in the keystore beside the Session cookie, and a write
 * that updated only one of them is a lie the next render tells. After either
 * route succeeds `hasPassword` is true, and the password row on Settings reads
 * exactly that. The two writes below cover the mirror and the keystore; the auth
 * state is the caller's, through `accountUpdated` on `useAuth()`, for the same
 * reason `saveProfile` dispatches its own.
 *
 * ## A successful write leaves the person signed in
 *
 * Ticket 06 asks for it and the API already does it. `AuthService.setUserPassword`
 * and `changeUserPassword` call Better Auth with the body alone: neither passes
 * `revokeOtherSessions`, and neither controller appends a `Set-Cookie` the way
 * `updateProfile` does, so no session is revoked and the cookie this client holds
 * is not rotated. Read from `api/src/modules/auth/auth.controller.ts` and
 * `auth.service.ts` rather than assumed.
 */

const SET_PASSWORD_PATH = "/auth/set-password";
const CHANGE_PASSWORD_PATH = "/auth/change-password";

/**
 * Bring the mirror and the keystore in line with a person the API has just
 * re-described, and hand them back.
 *
 * One helper rather than two copies, because the pair of writes is the whole
 * obligation and doing one of them is worse than doing neither: a mirror ahead
 * of the keystore means this launch and the next disagree about the same
 * account.
 */
async function holdUpdatedPerson(user: SessionUser): Promise<SessionUser> {
  setSessionUser(user);
  await writeKeptPerson(user);
  return user;
}

/**
 * Give an account that has none its first password.
 *
 * `POST /auth/set-password` answers a bare boolean rather than a person, which
 * is the one place in this module the updated person is derived rather than
 * read. It is safe because of how little is derived: `hasPassword` is the only
 * field this route can have changed, and it can only have changed one way, so
 * the held person is carried across with that single flag flipped and nothing
 * else is invented.
 *
 * Two answers are refused rather than treated as success. A `false` status is
 * the server declining to claim it set anything, which is not a password anybody
 * may be told they now have. And a held person of null leaves the derivation
 * with nothing to derive from: unreachable in practice, since a 200 from a
 * guarded route means there was a session and a session means a held person, and
 * reported rather than guessed at because a guess here would write a stranger
 * into the keystore.
 */
export async function setPassword(
  newPassword: string,
): Promise<ApiResult<SessionUser>> {
  const outcome = await authenticatedRequest(SET_PASSWORD_PATH, {
    method: "POST",
    body: { newPassword },
  });

  const held = getSessionUser();
  const result = readOutcome(outcome, (data) =>
    data === true && held ? { ...held, hasPassword: true } : null,
  );

  return result.ok ? { ok: true, value: await holdUpdatedPerson(result.value) } : result;
}

/**
 * Replace the password on an account that has one, by proving the current one.
 *
 * The current password is what stops somebody holding an unlocked phone quietly
 * replacing it, and it is checked by the API rather than here: this module has
 * no way to know whether a password is right, and a client that tried would be
 * guessing at a hash it has never seen.
 *
 * `POST /auth/change-password` answers with the re-read session user, so what
 * lands is the server's account of this person and never the input. A name or a
 * role that moved elsewhere arrives on this answer too, which is exactly how
 * `lib/profile-api` treats its own.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ApiResult<SessionUser>> {
  const outcome = await authenticatedRequest(CHANGE_PASSWORD_PATH, {
    method: "POST",
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
  });

  const result = readOutcome(outcome, parseSessionUser);

  return result.ok ? { ok: true, value: await holdUpdatedPerson(result.value) } : result;
}
