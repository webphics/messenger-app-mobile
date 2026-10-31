import { parseDeletion } from "@/lib/account-deletion";
import { readOutcome, type ApiResult } from "@/lib/api-result";
import { authenticatedRequest } from "@/lib/auth-service";

const DELETE_ACCOUNT_PATH = "/auth/delete-account";

/**
 * Delete the signed-in person's own account (`POST /auth/delete-account`).
 *
 * The body is empty. The route also takes a password, for a session over a day
 * old, and this client deliberately never sends one: the answer to a stale
 * session is a fresh sign-in, which works the same for an account that signs in
 * by link or with Google and has no password to give. `lib/account-deletion`
 * turns that refusal into the button that offers it.
 *
 * An account that signs in with Apple has its Apple grant revoked by the API as
 * part of this same request (`api/docs/planning/apple-sign-in.md`), which App
 * Review requires; there is nothing on the device to revoke, so nothing here
 * changes for it.
 *
 * Nothing local is cleared here. On success the caller signs out through
 * `useAuth().signOut`, which is the one path that wipes this device
 * (`lib/session-wipe`) and lands on sign-in.
 */
export async function deleteAccount(): Promise<ApiResult<true>> {
  const outcome = await authenticatedRequest(DELETE_ACCOUNT_PATH, {
    method: "POST",
    body: {},
  });

  return readOutcome(outcome, parseDeletion);
}
