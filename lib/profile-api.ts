import { readOutcome } from "@/lib/api-result";
import type { ApiResult } from "@/lib/api-result";
import { parseSessionUser } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { setSessionUser } from "@/lib/session";
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

  const result = readOutcome(outcome, parseSessionUser);

  // The same two writes a successful sign-in makes, for the same reason: the
  // signed-in person is held in three places and a write that updated only one
  // of them is a lie the next render tells. The auth state is the caller's —
  // `saveProfile` dispatches it — but screens read `getSessionUser()`, which is
  // a module snapshot rather than React state and therefore re-renders for
  // nobody, and the Kept person is what a cold start with no signal resolves to.
  //
  // Found on a device: onboarding wrote the name, the gate let the person
  // through, and the Hub went on greeting them by their email address until the
  // app was restarted.
  if (result.ok) {
    setSessionUser(result.value);
    await writeKeptPerson(result.value);
  }

  return result;
}
