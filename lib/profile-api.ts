import { readOutcome } from "@/lib/api-result";
import type { ApiResult } from "@/lib/api-result";
import { parseSessionUser } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";
import type { SessionUser } from "@/lib/types";

/**
 * The caller's own name, username and phone number.
 *
 * `PUT /auth/profile` is the one route that writes them, and it has two edges
 * worth naming here rather than at each call site:
 *
 * - **`name` is required on every call, and it is a replace rather than a
 *   patch.** There is no way to write the phone alone.
 * - **Omitting `phone` clears it.** The service writes `input.phone ?? null`
 *   unconditionally, which is the opposite of how `username` behaves on the same
 *   route — a body with no `username` leaves the existing one alone. So a caller
 *   that means to keep a phone number has to send it back, and this signature
 *   takes `phone` rather than making it optional so that forgetting it is a type
 *   error rather than a silently cleared column.
 *
 * The response carries the re-read session user, which is what makes this the
 * write the onboarding gate closes on: the answer is the new name, not the one
 * that was asked for.
 */
export async function updateProfile(input: {
  name: string;
  /** `null` clears it. Send the current value to keep it. */
  phone: string | null;
}): Promise<ApiResult<SessionUser>> {
  const outcome = await authenticatedRequest("/auth/profile", {
    method: "PUT",
    body: { name: input.name, phone: input.phone },
  });

  return readOutcome(outcome, parseSessionUser);
}
