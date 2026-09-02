import {
  apiRequest,
  clearCsrfPair,
  getSessionCookie,
  setSessionCookie,
  type ApiRequestOptions,
} from "@/lib/api-client";
import {
  interpretMagicLinkRequest,
  interpretMagicLinkVerify,
  interpretSession,
  interpretSignIn,
  saysSessionExpired,
  type AuthOutcome,
  type HttpOutcome,
  type MagicLinkRequestOutcome,
} from "@/lib/auth-response";
import {
  clearRetiredCredential,
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import {
  MAGIC_LINK_ORIGIN,
  MAGIC_LINK_TOKEN_PARAM,
  MAGIC_LINK_UNCONFIGURED_NOTICE,
} from "@/lib/magic-link-config";
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
const MAGIC_LINK_REQUEST_PATH = "/auth/magic-link";
const MAGIC_LINK_VERIFY_PATH = "/auth/magic-link/verify";

/**
 * Bumped every time the credential is deliberately discarded.
 *
 * A request that started before the bump is stale by the time it lands, and a
 * stale success must not write a cookie: a sign-out that arrived while a sign-in
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
 * stored cookie may well still be good, and throwing it away because the train
 * went into a tunnel would sign the person out for the wrong reason.
 */
async function applyOutcome(outcome: AuthOutcome, startedAt: number): Promise<void> {
  if (startedAt !== credentialEpoch) return;

  switch (outcome.kind) {
    case "signed-in":
      setSessionCookie(outcome.cookie);
      setSessionUser(outcome.user);
      await writeSessionCookie(outcome.cookie);
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
  setSessionCookie(null);
  clearCsrfPair();
  setSessionUser(null);
  await clearSessionCookie();
}

/**
 * Cold start: read the stored Session cookie and find out who it belongs to.
 *
 * Returns null when there was no cookie to check — a first run, or after a sign-out.
 */
export async function hydrateAuth(): Promise<AuthOutcome | null> {
  // Captured before the first await, so a sign-out arriving at any point during
  // hydration — including while the keychain read is outstanding — invalidates it.
  const startedAt = credentialEpoch;
  // Cold start is the one moment this app already reaches for stored identity, so
  // it is where earlier slices' leftovers get swept up. Neither is awaited:
  // nothing downstream reads those keys, and a slow storage call must not delay
  // sign-in.
  void purgeMockSession();
  void clearRetiredCredential();
  const cookie = await readSessionCookie();

  // A sign-out that overtook the keychain read wins outright — holding the cookie
  // it just deleted would attach a credential to every later request.
  if (startedAt !== credentialEpoch) return null;

  if (!cookie) {
    await forgetCredential();
    return null;
  }

  // Held before the request so `apiRequest` attaches it, same as every later call.
  setSessionCookie(cookie);

  const outcome = interpretSession(await apiRequest(SESSION_PATH), cookie);
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
 * Ask the API to email a sign-in link.
 *
 * The origin travels with the request rather than being configured on the
 * server, because it is this build that knows where its own links have to point:
 * the API appends `/auth/magic-link?token=…` to whatever it is given, and the
 * same API serves the web client, whose links go somewhere else entirely.
 *
 * Nothing is stored and no credential changes hands, so there is no epoch to
 * capture here and nothing for `applyOutcome` to apply. That is also why a
 * request in flight cannot be invalidated by a sign-out: there is nothing in it
 * to invalidate.
 */
export async function requestMagicLink(
  email: string,
): Promise<MagicLinkRequestOutcome> {
  if (MAGIC_LINK_ORIGIN === null) {
    return { kind: "refused", message: MAGIC_LINK_UNCONFIGURED_NOTICE };
  }

  return interpretMagicLinkRequest(
    await apiRequest(MAGIC_LINK_REQUEST_PATH, {
      method: "POST",
      body: { email: email.trim(), url: MAGIC_LINK_ORIGIN },
    }),
  );
}

/**
 * Spend a link's token for a session.
 *
 * The same shape as `signInWithPassword` on purpose, down to the epoch: this
 * establishes a credential, so it has to store one, and a sign-out that overtook
 * it must not leave a live cookie in the keychain. What arrives is an
 * `AuthOutcome` like any other, which is what keeps the two ways of signing in
 * on one seam instead of two.
 *
 * A GET, so the CSRF pre-flight is waived — the token in the query *is* the
 * credential being presented, and the guard has nothing to add to a request that
 * carries no session.
 */
export async function verifyMagicLink(token: string): Promise<AuthOutcome> {
  const startedAt = credentialEpoch;
  const query = `${MAGIC_LINK_TOKEN_PARAM}=${encodeURIComponent(token)}`;
  const outcome = interpretMagicLinkVerify(
    await apiRequest(`${MAGIC_LINK_VERIFY_PATH}?${query}`),
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
 * do next would still carry the old cookie. The cookie is captured and handed to
 * the logout call explicitly, so the server still learns which session ended.
 */
export async function signOut(): Promise<void> {
  const ending = getSessionCookie();

  await forgetCredential();

  if (ending) {
    await apiRequest(SIGN_OUT_PATH, { method: "POST", cookie: ending });
  }
}

/**
 * Whoever needs to know that the session ended without anyone asking for it.
 *
 * A `Set` rather than a single slot because nothing here owns the only listener:
 * `AuthProvider` is the one today, and a provider remounting in development
 * subscribes before the old one unsubscribes.
 */
const expiryListeners = new Set<() => void>();

/** Listen for the Session cookie being rejected mid-use. Returns the way to stop. */
export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => {
    expiryListeners.delete(listener);
  };
}

/**
 * Make a request as the signed-in person, and end the session if the server says
 * the credential is dead.
 *
 * This exists so that no call site has to remember the rule, in the same spirit as
 * the Session cookie being attached in one place rather than at every call. A
 * screen asking for its data cannot forget to handle a 401, because handling one
 * is not its job: it gets the answer it asked for, and the session ends around it.
 *
 * Local only, deliberately. A cookie the server just refused cannot be used to
 * tell the server about itself, so unlike `signOut` there is nothing to send —
 * `POST /auth/logout` would earn a second 401.
 *
 * Every call the later phases make to a session-protected endpoint comes through
 * here rather than through `apiRequest`; the auth endpoints above do not, because
 * each of them already interprets its own answer, and a 401 there is a refused
 * password or a cold start that found a stale cookie rather than a session ending
 * under someone.
 */
export async function authenticatedRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<HttpOutcome> {
  const startedAt = credentialEpoch;
  const outcome = await apiRequest(path, options);

  // The epoch check makes this report once. Several requests in flight when a
  // session dies all come back unauthorised, and all but the first are stale by
  // the time they land — announcing each would push a second navigation at a
  // sign-in screen someone may already be typing on.
  if (saysSessionExpired(outcome) && startedAt === credentialEpoch) {
    await forgetCredential();
    for (const listener of expiryListeners) listener();
  }

  return outcome;
}
