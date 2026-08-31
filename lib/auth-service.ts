import { apiRequest, getBearerToken, setBearerToken } from "@/lib/api-client";
import {
  interpretSession,
  interpretSignIn,
  type AuthOutcome,
} from "@/lib/auth-response";
import { clearSessionToken, readSessionToken, writeSessionToken } from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import { setSessionUser } from "@/lib/session";

/**
 * The I/O the auth state machine cannot do.
 *
 * Every function here is a sequence of calls that ends in an `AuthOutcome` for
 * `authTransition` to interpret. Deciding what an outcome *means* stays in
 * `lib/auth-machine`; deciding what to keep on disk because of it lives here.
 */

const SIGN_IN_PATH = "/auth/login";
const SESSION_PATH = "/auth/session";
const SIGN_OUT_PATH = "/auth/logout";

/**
 * Bumped every time the credential is deliberately discarded.
 *
 * A request that started before the bump is stale by the time it lands, and a
 * stale success must not write a token: a sign-out that arrived while a sign-in
 * was in flight would otherwise leave a live credential in the keychain and sign
 * the person back in at next launch. Sign-out is not reachable mid-sign-in in
 * today's screens, which is exactly why this is worth pinning down now rather
 * than after a later screen makes it reachable.
 */
let credentialEpoch = 0;

/**
 * Bring the keychain and the held credential in line with what just happened.
 *
 * A transport failure or an unreadable answer deliberately changes nothing: the
 * stored token may well still be good, and throwing it away because the train
 * went into a tunnel would sign the person out for the wrong reason.
 */
async function applyOutcome(outcome: AuthOutcome, startedAt: number): Promise<void> {
  if (startedAt !== credentialEpoch) return;

  switch (outcome.kind) {
    case "signed-in":
      setBearerToken(outcome.token);
      setSessionUser(outcome.user);
      await writeSessionToken(outcome.token);
      return;
    // Neither establishes a session, so neither may leave a credential behind.
    case "unauthorised":
    case "two-factor":
      await forgetCredential();
      return;
    // None of these say the credential is bad, so none of them may erase it.
    case "transport-failure":
    case "server-error":
    case "malformed":
      return;
  }
}

async function forgetCredential(): Promise<void> {
  credentialEpoch += 1;
  setBearerToken(null);
  setSessionUser(null);
  await clearSessionToken();
}

/**
 * Cold start: read the stored Session token and find out who it belongs to.
 *
 * Returns null when there was no token to check — a first run, or after a sign-out.
 */
export async function hydrateAuth(): Promise<AuthOutcome | null> {
  // Captured before the first await, so a sign-out arriving at any point during
  // hydration — including while the keychain read is outstanding — invalidates it.
  const startedAt = credentialEpoch;
  // Cold start is the one moment this app already reaches for stored identity, so
  // it is where the mock shell's leftovers get swept up. Not awaited: nothing
  // downstream reads that key, and a slow storage call must not delay sign-in.
  void purgeMockSession();
  const token = await readSessionToken();

  // A sign-out that overtook the keychain read wins outright — holding the token
  // it just deleted would attach a credential to every later request.
  if (startedAt !== credentialEpoch) return null;

  if (!token) {
    await forgetCredential();
    return null;
  }

  // Held before the request so `apiRequest` attaches it, same as every later call.
  setBearerToken(token);

  const outcome = interpretSession(await apiRequest(SESSION_PATH), token);
  await applyOutcome(outcome, startedAt);
  return outcome;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const startedAt = credentialEpoch;
  const outcome = interpretSignIn(
    await apiRequest(SIGN_IN_PATH, {
      method: "POST",
      body: { email: email.trim(), password },
    }),
  );

  await applyOutcome(outcome, startedAt);
  return outcome;
}

/**
 * End the session here, and on the server when it can be reached.
 *
 * Local first, deliberately. Telling the server before clearing would leave a
 * live credential held for as long as that request takes — and React Native's
 * `fetch` has no timeout, so on a dead network that is tens of seconds during
 * which the person has already been shown the sign-in screen and whatever they
 * do next would still carry the old token. The token is captured and handed to
 * the logout call explicitly, so the server still learns which session ended.
 */
export async function signOut(): Promise<void> {
  const ending = getBearerToken();

  await forgetCredential();

  if (ending) {
    await apiRequest(SIGN_OUT_PATH, { method: "POST", bearer: ending });
  }
}
