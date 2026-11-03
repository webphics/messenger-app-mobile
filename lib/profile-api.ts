import type { UploadFile } from "@/lib/api-client";
import { readOutcome } from "@/lib/api-result";
import type { ApiResult } from "@/lib/api-result";
import { parseSessionUser, type HttpOutcome } from "@/lib/auth-response";
import {
  adoptReplacedSessionCookie,
  authenticatedRequest,
  currentCredentialEpoch,
} from "@/lib/auth-service";
import { writeKeptPerson } from "@/lib/keychain";
import { setSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/**
 * The caller's own name, username, phone number and photo.
 *
 * `PUT /auth/profile` is the one route that writes the first three, and it has
 * two edges worth naming here rather than at each call site:
 *
 * - **`name` is required on every call, and it is a replace rather than a
 *   patch.** There is no way to write the phone alone.
 * - **Omitting `phone` clears it.** The service writes `input.phone ?? null`
 *   unconditionally, which is the opposite of how `username` behaves on the same
 *   route — a body with no `username` leaves the existing one alone. So a caller
 *   that means to keep a phone number has to send it back, and this signature
 *   takes `phone` rather than making it optional so that forgetting it is a type
 *   error rather than a silently cleared column. `username` is optional for the
 *   opposite reason: absent is how "unchanged" is said.
 *
 * The photo has two routes of its own, `POST` and `DELETE /auth/profile/avatar`,
 * and both answer with the same re-read session user. Neither existed on the
 * web client, which draws a photo and offers no way to change it.
 *
 * Every response carries the re-read session user, which is what makes this the
 * write the onboarding gate closes on: the answer is the new name, not the one
 * that was asked for.
 */
export async function updateProfile(input: {
  name: string;
  /** Absent leaves the current username alone. */
  username?: string;
  /** `null` clears it. Send the current value to keep it. */
  phone: string | null;
}): Promise<ApiResult<SessionUser>> {
  const startedAt = currentCredentialEpoch();
  const outcome = await authenticatedRequest("/auth/profile", {
    method: "PUT",
    body: {
      name: input.name,
      ...(input.username === undefined ? {} : { username: input.username }),
      phone: input.phone,
    },
  });
  return settle(outcome, startedAt);
}

/** Replace the caller's photo with a file on this device, streamed as the `file` field. */
export async function uploadProfilePhoto(file: UploadFile): Promise<ApiResult<SessionUser>> {
  const startedAt = currentCredentialEpoch();
  const outcome = await authenticatedRequest("/auth/profile/avatar", { method: "POST", file });
  return settle(outcome, startedAt);
}

/** Remove the caller's photo, which leaves initials in its place everywhere. */
export async function removeProfilePhoto(): Promise<ApiResult<SessionUser>> {
  const startedAt = currentCredentialEpoch();
  const outcome = await authenticatedRequest("/auth/profile/avatar", { method: "DELETE" });
  return settle(outcome, startedAt);
}

async function settle(outcome: HttpOutcome, startedAt: number): Promise<ApiResult<SessionUser>> {
  const result = readOutcome(outcome, parseSessionUser);

  // The same two writes a successful sign-in makes, for the same reason: the
  // signed-in person is held in three places and a write that updated only one
  // of them is a lie the next render tells. The auth state is the caller's —
  // `saveProfile` and `accountUpdated` dispatch it — but screens read
  // `getSessionUser()`, which is a module snapshot rather than React state and
  // therefore re-renders for nobody, and the Kept person is what a cold start
  // with no signal resolves to.
  //
  // Found on a device: onboarding wrote the name, the gate let the person
  // through, and the Hub went on greeting them by their email address until the
  // app was restarted.
  //
  // The cookie first. All three routes go through Better Auth's `updateUser`,
  // which re-sets the Session cookie on every success, and `docs/api/auth.md`
  // asks a native client to keep the re-issued copy like any other.
  if (result.ok) {
    await adoptReplacedSessionCookie(outcome, startedAt);
    setSessionUser(result.value);
    await writeKeptPerson(result.value);
  }

  return result;
}
