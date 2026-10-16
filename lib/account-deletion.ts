import type { ApiFailure } from "@/lib/api-result";

/**
 * What the Delete account screen says when `POST /auth/delete-account` did not
 * answer with a deleted account, and what it offers next.
 *
 * Two kinds, because a refusal asks for one of two different things. Most are
 * final for now and need only their sentence: the last admin has to promote
 * somebody first, and nothing on this phone changes that. One is a way forward:
 * the API wants a session under a day old, and the way to get one is to sign out
 * and back in, so the screen offers that button instead of a retry that would be
 * refused the same way.
 *
 * A `malformed` answer is a 2xx this build could not read, and a 2xx from this
 * route means the account is most likely gone. It is sent the same way, because
 * signing in again is how the person finds out, and staying signed in to an
 * account that may not exist would only fail later and less clearly.
 *
 * `unauthorised` is null: the session has already ended, and the app is
 * already on its way to sign-in.
 */
export type DeletionNotice =
  | { kind: "reauthenticate"; message: string }
  | { kind: "refused"; message: string };

export const REAUTHENTICATION_REQUIRED = "reauthentication_required";

export function deletionNotice(failure: ApiFailure): DeletionNotice | null {
  switch (failure.kind) {
    case "unauthorised":
      return null;
    case "unreachable":
      return {
        kind: "refused",
        message:
          "Could not reach the server, so your account was not deleted. Check your connection and try again.",
      };
    case "malformed":
      return {
        kind: "reauthenticate",
        message:
          "The server answered with something this app did not understand, so your account may already be deleted. Sign in again to check.",
      };
    case "refused":
      return failure.code === REAUTHENTICATION_REQUIRED
        ? { kind: "reauthenticate", message: failure.message }
        : { kind: "refused", message: failure.message };
  }
}

/** The route's `data`, `{ deleted: true }`, or null for anything else. */
export function parseDeletion(data: unknown): true | null {
  return typeof data === "object" &&
    data !== null &&
    (data as { deleted?: unknown }).deleted === true
    ? true
    : null;
}
