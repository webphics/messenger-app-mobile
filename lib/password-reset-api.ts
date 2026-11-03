import { asRecord } from "@/lib/api-envelope";
import { readOutcome, type ApiFailure } from "@/lib/api-result";
import type { HttpOutcome } from "@/lib/auth-response";
import { authenticatedRequest } from "@/lib/auth-service";

/**
 * Asking the API to email a password-reset link: for somebody on the Change
 * password screen who does not remember the password it asks them to prove, and
 * for somebody on the sign-in password step who does not remember theirs.
 *
 * The link is the whole of the recovery, and none of it happens in this app:
 * it points at `https://thechatroute.com/reset-password?token=…`, the new
 * password is set on that web page, and the token is single-use and lasts an
 * hour. So this module sends one request and reads one answer, and nothing
 * here handles the link coming back.
 *
 * `authenticatedRequest` like `lib/password-api`, although the route itself
 * asks for no session: it is the transport that holds the CSRF pair and the
 * deadline, and with no session it sends the request all the same.
 *
 * ## Four outcomes rather than `ApiResult`'s two
 *
 * A rate limit is told apart from every other refusal, because it is the one a
 * person answers by waiting rather than by retrying or fixing something. It is
 * read off the status and not the code: the route's `429` code is not settled,
 * and both of the API's limiters answer `429` whatever they call it.
 *
 * `data: { sent: true }` is the API's answer whether or not the address has an
 * account, so `sent` means "nothing went wrong" and never "an account exists".
 * On Change password the address is the signed-in person's own, so the
 * difference is moot; on sign-in it is not, which is `ResetAudience`.
 */

const FORGOT_PASSWORD_PATH = "/auth/password/forgot";

export type ResetRequestOutcome =
  | { kind: "sent" }
  /** `retryAfterSeconds` where the API said, null where it did not. */
  | { kind: "rate-limited"; retryAfterSeconds: number | null }
  | { kind: "failed"; failure: ApiFailure };

/** `meta.retryAfter` on the error envelope, when it is a usable number of seconds. */
function retryAfter(body: unknown): number | null {
  const seconds = asRecord(asRecord(body)?.meta)?.retryAfter;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : null;
}

/** One outcome of `POST /auth/password/forgot`, read. Pure, so it can be table-tested. */
export function readResetRequest(outcome: HttpOutcome): ResetRequestOutcome {
  if (outcome.reached && outcome.status === 429) {
    return { kind: "rate-limited", retryAfterSeconds: retryAfter(outcome.body) };
  }

  const result = readOutcome(outcome, (data) =>
    asRecord(data)?.sent === true ? true : null,
  );
  return result.ok ? { kind: "sent" } : { kind: "failed", failure: result.failure };
}

/** Email a reset link to `email`, which on the Change password screen is the signed-in person's own. */
export async function requestPasswordReset(email: string): Promise<ResetRequestOutcome> {
  return readResetRequest(
    await authenticatedRequest(FORGOT_PASSWORD_PATH, {
      method: "POST",
      body: { email: email.trim() },
    }),
  );
}

/**
 * Whose address the link was asked for. `own` is the signed-in person's, on
 * Change password. `typed` is whatever was entered on sign-in, which may belong
 * to nobody, so the sentence says "if" rather than telling a stranger whether
 * the address has an account.
 */
export type ResetAudience = "own" | "typed";

/** Sign-in accepts a username, but reset links only go to an address. */
export const USERNAME_RESET_NOTICE =
  "Reset links go to an email address. Change it to the email you sign in with, then tap Forgot password? again.";

/**
 * What the screen says once a request has settled. Null for an expired
 * session, the convention every write here follows: the auth layer is already
 * on its way to sign-in.
 *
 * The sent sentence names the address and says where the password is set,
 * because both are things a person would otherwise go looking for: which inbox,
 * and why the link opens a browser rather than this app.
 */
export function resetRequestNotice(
  outcome: ResetRequestOutcome,
  email: string,
  audience: ResetAudience = "own",
): string | null {
  switch (outcome.kind) {
    case "sent":
      return audience === "own"
        ? `A link to set a new password is on its way to ${email.trim()}. Open it on this phone or a computer, and set the new password in your browser. The link works once and expires after an hour.`
        : `If ${email.trim()} has an account, a link to set a new password is on its way. Open it on this phone or a computer, and set the new password in your browser. The link works once and expires after an hour.`;
    case "rate-limited": {
      if (outcome.retryAfterSeconds === null) {
        return "Too many reset emails have been asked for. Wait a few minutes, then try again.";
      }
      const minutes = Math.ceil(outcome.retryAfterSeconds / 60);
      return `Too many reset emails have been asked for. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    case "failed":
      switch (outcome.failure.kind) {
        case "unreachable":
          return "Could not reach the server, so no email was sent. Check your connection and try again.";
        case "refused":
          return outcome.failure.message;
        case "malformed":
          return "The server answered with something this app did not understand. A reset email may not have been sent.";
        case "unauthorised":
          return null;
      }
  }
}
