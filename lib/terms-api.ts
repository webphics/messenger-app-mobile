import { readOutcome, type ApiResult } from "@/lib/api-result";
import { parseSessionUser } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { setSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/**
 * Agreeing to the Terms of Use, for somebody signed in who has not yet
 * (`POST /auth/terms`). The API stamps the date and answers with the re-read
 * session user, which is what closes the terms gate: `termsAcceptedAt` is the
 * stored one, never this phone's clock.
 *
 * The same two writes `updateProfile` makes on success, for its reason: the
 * person is held in three places and the auth state is the caller's.
 */
export async function acceptTerms(): Promise<ApiResult<SessionUser>> {
  const result = readOutcome(
    await authenticatedRequest("/auth/terms", { method: "POST" }),
    parseSessionUser,
  );
  if (result.ok) {
    setSessionUser(result.value);
    await writeKeptPerson(result.value);
  }
  return result;
}
