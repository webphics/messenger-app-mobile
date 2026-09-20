import { apiRequest } from "@/lib/api-client";
import { asRecord } from "@/lib/api-envelope";
import { readOutcome } from "@/lib/api-result";
import type { ApiResult } from "@/lib/api-result";
import { normaliseIdentifier } from "@/lib/sign-in-identifier";

/**
 * What the sign-in form learns about an identifier before it decides which
 * controls its second step draws.
 *
 * `POST /auth/account-state`, added to the API after this client's sign-in was
 * built. It answers two booleans and nothing else: no name, no id, nothing else
 * off the row.
 *
 * **It reverses what this client assumed.** The three-step form was written on
 * the premise that the API refuses to say whether an account exists — one `401`
 * for every wrong credential, a `200` for a link to a username that matches
 * nothing — so step one advanced for everybody and the password attempt was
 * what answered it. This route is that answer being given deliberately instead,
 * and the API's own schema says why: drawing the controls *is* the disclosure,
 * because a second step with no password field already tells you the address
 * has no password, whatever the payload withheld. Having conceded that much,
 * the route bounds it — rate limited per identifier and per IP — rather than
 * leaving the form to leak it for free.
 *
 * `hasPassword` is false for an identifier nobody holds and for an account that
 * has only ever used Google. Both get the link-only screen; they are kept apart
 * so the heading can say the right thing.
 */
export type AccountState = {
  exists: boolean;
  hasPassword: boolean;
};

export function parseAccountState(data: unknown): AccountState | null {
  const record = asRecord(data);
  if (!record) return null;

  const { exists, hasPassword } = record;
  if (typeof exists !== "boolean" || typeof hasPassword !== "boolean") {
    return null;
  }

  // The API states this rather than merely happening to send it, so a payload
  // that breaks it is a shape this build does not understand rather than a
  // fact to act on: an identifier nobody holds cannot have a password.
  if (!exists && hasPassword) return null;

  return { exists, hasPassword };
}

/**
 * Ask which controls step two should draw.
 *
 * `POST` rather than `GET`, which the API is explicit about: it keeps the
 * address out of the URL and therefore out of every access log and referrer
 * between here and the handler. It carries no session, and establishes none.
 *
 * The identifier is lower-cased on the way out because the API lower-cases
 * before it looks up — `Ada@` and `ada@` are one address — and because the
 * cache in `lib/account-state-cache` keys on what is sent.
 */
export async function fetchAccountState(
  identifier: string,
): Promise<ApiResult<AccountState>> {
  const outcome = await apiRequest("/auth/account-state", {
    method: "POST",
    body: { identifier: normaliseIdentifier(identifier) },
  });

  return readOutcome(outcome, parseAccountState);
}
