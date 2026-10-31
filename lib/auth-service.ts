import {
  apiRequest,
  clearCsrfPair,
  getSessionCookie,
  setSessionCookie,
  type ApiRequestOptions,
} from "@/lib/api-client";
import {
  appleNameSettled,
  appleNameToSend,
  hasAppleName,
  interpretAppleNonce,
  type AppleResult,
} from "@/lib/apple-auth";
import { requestAppleCredential } from "@/lib/apple-session";
import {
  interpretAppleSignIn,
  interpretGoogleSignIn,
  interpretMagicLinkRequest,
  interpretMagicLinkVerify,
  interpretSession,
  interpretSignIn,
  interpretSignUp,
  interpretTwoFactorVerify,
  saysSessionExpired,
  saysTermsRequired,
  type AuthOutcome,
  type HttpOutcome,
  type MagicLinkRequestOutcome,
  type SignUpOutcome,
} from "@/lib/auth-response";
import type { GoogleResult } from "@/lib/google-auth";
import {
  releaseGoogleSession,
  requestGoogleIdToken,
} from "@/lib/google-session";
import {
  clearAppleName,
  clearKeptPerson,
  clearRetiredCredential,
  clearSessionCookie,
  readAppleName,
  readKeptPerson,
  readSessionCookie,
  writeAppleName,
  writeKeptPerson,
  writeSessionCookie,
} from "@/lib/keychain";
import { purgeMockSession } from "@/lib/legacy-session";
import {
  MAGIC_LINK_ORIGIN,
  MAGIC_LINK_TOKEN_PARAM,
  MAGIC_LINK_UNCONFIGURED_NOTICE,
} from "@/lib/magic-link-config";
import { setSessionUser } from "@/lib/session";
import { pushDeregistrationSettled } from "@/lib/push-registry";
import { endSessionOnDevice } from "@/lib/session-wipe";
import { normaliseCode } from "@/lib/two-factor-challenge";
import type { SessionUser } from "@/lib/types";

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
const SIGN_UP_PATH = "/auth/sign-up";
const GOOGLE_PATH = "/auth/google";
const APPLE_PATH = "/auth/apple";
const APPLE_NONCE_PATH = "/auth/apple/nonce";
const TWO_FACTOR_VERIFY_PATH = "/auth/two-factor/verify-totp";

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
 * A transport failure or an unreadable answer deliberately changes nothing about
 * the credential: the stored cookie may well still be good, and throwing it away
 * because the train went into a tunnel would sign the person out for the wrong
 * reason.
 *
 * `kept` is the Kept person, and only Hydration passes one — it is who this
 * device says the cookie belongs to, and it answers exactly the outcomes that
 * leave the cookie alone. This is the only exhaustive list of those outcomes in
 * the app outside the state machine's own, which is why the mirror is set here
 * rather than at the call site guessing which branch it landed in.
 */
async function applyOutcome(
  outcome: AuthOutcome,
  startedAt: number,
  kept: SessionUser | null = null,
): Promise<void> {
  if (startedAt !== credentialEpoch) return;

  switch (outcome.kind) {
    case "signed-in":
      setSessionCookie(outcome.cookie);
      setSessionUser(outcome.user);
      await writeSessionCookie(outcome.cookie);
      // Beside the cookie, in the same write: from here a cold start that cannot
      // reach the API still knows who this is. Written on every established
      // session, including the one that just confirmed a Stale one, so a role
      // changed on the web is what the *next* cold start restores.
      await writeKeptPerson(outcome.user);
      return;
    // Neither establishes a session, so neither may leave a credential behind.
    //
    // A challenge is no longer the end of the road, and the wipe still stands:
    // the password was accepted but nothing was issued, so anything this device
    // was holding from an earlier session is still a credential nobody has
    // proved they own. What the challenge carries never touches any of this.
    // `outcome.challenge` is deliberately not read here, so the challenge cookie
    // is never written to the keychain and never becomes the held Session
    // cookie. It lives in the machine state and nowhere else, which is what
    // makes leaving that state the whole of discarding it. See ADR-0013.
    case "unauthorised":
    case "two-factor":
      await forgetCredential();
      return;
    // None of these say the credential is bad, so none of them may erase it —
    // and with a Kept person to hand, none of them leaves the screens with
    // nobody to draw either. The state machine reaches the same verdict from the
    // same three cases; this is what makes `getSession()` agree with it.
    case "transport-failure":
    case "server-error":
    case "malformed":
      if (kept) setSessionUser(kept);
      return;
  }
}

/**
 * Discard the credential, everything on this device that was only readable
 * because of it, and the registration that let the API reach this phone as the
 * person it belonged to.
 *
 * The Store is wiped here rather than at each of the ways a session can end, so
 * that there is one answer to "what does a Session end leave behind" and it is
 * "nothing". Every moment that discards the Session cookie arrives here, and
 * they are not only the two that end a session:
 *
 * - signing out;
 * - a Session expiry, an authenticated request answered `401`;
 * - a cold start that finds no cookie, which is what covers a sign-out the
 *   operating system killed halfway — the database on disk is scoped by owner,
 *   but a device nobody is signed in on should be holding nothing at all;
 * - a sign-in the API refused, and a two-factor challenge, both by way of
 *   `applyOutcome`.
 *
 * The last of those is not a Session end, and it is wiped anyway. Nothing on
 * this device belongs to a session that was never established, the person is
 * standing on the sign-in screen either way, and a refused password is a
 * perfectly good moment to find out that an earlier wipe had not happened.
 *
 * Hydration's Unreachable outcome reaches none of this: `applyOutcome` returns
 * on a transport failure without discarding anything, so a kept cookie is a kept
 * Store — the one case where a Restored list is all there is to show.
 *
 * The wipe cannot fail this. `endSessionOnDevice` swallows what it can, and it is
 * caught here as well — the guarantee belongs to the Session end rather than to
 * the implementation of one of the things it destroys, in the same spirit as
 * signing out completing when the server cannot be told.
 */
async function forgetCredential(): Promise<void> {
  // Read before the line below takes it away. The push registration is removed
  // with a request, and a request needs a credential — this is the same capture
  // `signOut` makes for `POST /auth/logout`, made here so that all three moments
  // that end a session have one rather than only the one that signs out.
  const ending = getSessionCookie();

  credentialEpoch += 1;
  setSessionCookie(null);
  clearCsrfPair();
  setSessionUser(null);
  await clearSessionCookie();
  // With the cookie, always. A person kept beside a credential that has gone
  // would sign the next cold start in as them off a cookie that no longer
  // exists — or, worse on a shared device, hand their name to whoever picks the
  // phone up next.
  await clearKeptPerson();
  await endSessionOnDevice(ending).catch(() => {});
}

/**
 * What a Hydration found: what the API said, and who this device already thought
 * it was.
 *
 * Both, because the second only means anything in the light of the first. See
 * `afterHydration` in `lib/auth-machine`, which is where they are read together.
 */
export type HydrationResult = {
  outcome: AuthOutcome | null;
  kept: SessionUser | null;
};

/**
 * Cold start: read the stored Session cookie and find out who it belongs to.
 *
 * `outcome: null` means there was no cookie to check — a first run, or after a
 * sign-out. `kept` is the person stored beside that cookie, which is what lets a
 * launch with no network answer "this is who you were, and none of it is
 * confirmed" instead of answering nothing at all.
 */
export async function hydrateAuth(): Promise<HydrationResult> {
  // Captured before the first await, so a sign-out arriving at any point during
  // hydration — including while the keychain read is outstanding — invalidates it.
  const startedAt = credentialEpoch;
  // Cold start is the one moment this app already reaches for stored identity, so
  // it is where earlier slices' leftovers get swept up. Neither is awaited:
  // nothing downstream reads those keys, and a slow storage call must not delay
  // sign-in.
  void purgeMockSession();
  void clearRetiredCredential();
  // Together, because they are one credential in two keys and the launch screen
  // is waiting on both.
  const [cookie, kept] = await Promise.all([readSessionCookie(), readKeptPerson()]);

  // A sign-out that overtook the keychain read wins outright — holding the cookie
  // it just deleted would attach a credential to every later request.
  if (startedAt !== credentialEpoch) return { outcome: null, kept: null };

  if (!cookie) {
    await forgetCredential();
    // Deliberately not carried: a Kept person with no cookie is not half a
    // session, it is leftovers, and `forgetCredential` has just removed them.
    return { outcome: null, kept: null };
  }

  // Held before the request so `apiRequest` attaches it, same as every later call.
  setSessionCookie(cookie);

  const outcome = interpretSession(await apiRequest(SESSION_PATH), cookie);
  await applyOutcome(outcome, startedAt, kept);
  return { outcome, kept };
}

/**
 * Ask the API who the held cookie belongs to, with a session already on screen.
 *
 * The same request Hydration makes and a different job: nothing is waiting on
 * this, so there is no launch screen to hold up and nothing to navigate. It
 * replaces a Stale session with a confirmed one where it stands.
 *
 * Through `authenticatedRequest` rather than `apiRequest`, which is the whole
 * difference that matters: a cookie that expired while the phone had no signal
 * is an ordinary Session expiry here — the credential goes, the Store goes with
 * it, and the person is told — instead of the silent sign-out a second Hydration
 * would produce. A refusal is not this function's to report; by the time it
 * returns, the expiry has already been announced.
 *
 * Answers null when there is nothing to confirm against, which is a session that
 * ended while the request was being made.
 */
export async function confirmSession(): Promise<AuthOutcome | null> {
  const cookie = getSessionCookie();
  if (!cookie) return null;

  const startedAt = credentialEpoch;
  const outcome = interpretSession(await authenticatedRequest(SESSION_PATH), cookie);
  if (startedAt !== credentialEpoch) return null;

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
      // `identifier`, not `email`: the API takes a username or an email address in
      // this slot (its ADR 0010) and validates the body with a *strict* object, so
      // an `email` key is not merely ignored -- it is rejected outright, and the
      // sign-in answers "Unrecognized key: email" before a password is ever
      // checked. The field still carries whatever was typed; only the name moved.
      body: { identifier: email.trim(), password },
    }),
  );

  await applyOutcome(outcome, startedAt);
  return outcome;
}

/**
 * Finish a sign-in an account's second factor interrupted.
 *
 * The same shape as `signInWithPassword` on purpose, down to the epoch: this
 * establishes a credential, so it has to store one, and a sign-out that overtook
 * it must not leave a live cookie in the keychain. What comes back is an
 * ordinary `AuthOutcome`, which is what keeps the second half of the handshake
 * on the seam the first half already used.
 *
 * `challenge` is presented through `apiRequest`'s existing `cookie` option
 * rather than through a mechanism of its own, and it is the whole credential on
 * this request: `POST /auth/two-factor/verify-totp` carries no auth guard,
 * because at challenge time there is no session to guard it with. It comes from
 * the machine state and goes nowhere else. Nothing here holds it, and
 * `applyOutcome` never writes it.
 *
 * The code is normalised on the way out for the reason the identifier is trimmed
 * on the way into `signInWithPassword`: the API's body is a `z.strictObject`
 * over a TOTP code, and a code pasted with the space its authenticator draws is
 * the same code.
 *
 * Backup codes are deliberately not offered here and must not be added:
 * `POST /auth/two-factor/verify-backup-code` carries `@UseGuards(AuthGuard)`,
 * which resolves a full session, and at this moment there is none. See ADR-0013.
 */
export async function verifyTwoFactorCode(
  challenge: string,
  code: string,
): Promise<AuthOutcome> {
  const startedAt = credentialEpoch;
  const outcome = interpretTwoFactorVerify(
    await apiRequest(TWO_FACTOR_VERIFY_PATH, {
      method: "POST",
      body: { code: normaliseCode(code) },
      cookie: challenge,
    }),
  );

  await applyOutcome(outcome, startedAt);
  return outcome;
}

/**
 * Pick a Google account, and trade what Google mints for a session here.
 *
 * The same shape as `signInWithPassword` once there is a token — one request,
 * one `AuthOutcome`, one `applyOutcome` — because past that point Google is not
 * special. What is different is everything before it: the account sheet can be
 * dismissed, and Play services can be missing, and neither of those is anything
 * `AuthOutcome` can say. So this returns a `GoogleResult`, which `googleAuthEvent`
 * turns into one of the events the machine already has.
 *
 * The native session is released when — and only when — an ID token was
 * exchanged and no session came back. Nothing is released on a dismissed or
 * failed sheet, because nothing was established to release.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  const attempt = await requestGoogleIdToken();
  // Nothing was established, so there is nothing to undo — and a dismissed sheet
  // in particular must leave the device exactly as it found it.
  if (attempt.kind !== "token") return attempt;

  const startedAt = credentialEpoch;
  const outcome = interpretGoogleSignIn(
    await apiRequest(GOOGLE_PATH, {
      method: "POST",
      body: { idToken: attempt.idToken },
    }),
  );

  await applyOutcome(outcome, startedAt);
  // The other half of "signed out rather than half signed in": `applyOutcome`
  // has cleared this side, and this clears Google's. Without it the device is
  // left holding an account our API refused, and the next tap skips the picker
  // and presents that same identity again — leaving nobody able to choose the
  // account that would have worked.
  if (outcome.kind !== "signed-in") await releaseGoogleSession();

  return { kind: "settled", outcome };
}

/**
 * Sign in with Apple, and trade the credential for a session here.
 *
 * Three steps where Google has two. A nonce first, from the API, because the
 * sheet has to be opened with it: the token Apple mints carries its hash, and
 * the API spends the nonce, so a token can be presented once. Asking first also
 * means a server with no Apple configuration says so before the sheet opens,
 * not after the person has authorised the app.
 *
 * The code goes up with the token so the API can exchange it for the grant it
 * revokes when the account is deleted (`api/docs/planning/apple-sign-in.md`).
 * The name Apple shares once is kept on the device until an account holds it.
 * There is no native session to release afterwards: Apple keeps none on the
 * device for this app to hold.
 */
export async function signInWithApple(): Promise<AppleResult> {
  const issued = interpretAppleNonce(
    await apiRequest(APPLE_NONCE_PATH, { method: "POST", body: {} }),
  );
  if (issued.kind === "unreached") {
    return { kind: "settled", outcome: { kind: "transport-failure" } };
  }
  if (issued.kind !== "nonce") return issued;

  const attempt = await requestAppleCredential(issued.hashedNonce);
  if (attempt.kind !== "credential") return attempt;

  const { kind: _kind, appleUserId, givenName, familyName, ...credential } = attempt;
  const shared = { givenName, familyName };
  if (hasAppleName(shared)) await writeAppleName(appleUserId, shared);
  const name = appleNameToSend(
    shared,
    hasAppleName(shared) ? null : await readAppleName(appleUserId),
  );

  const startedAt = credentialEpoch;
  const outcome = interpretAppleSignIn(
    await apiRequest(APPLE_PATH, {
      method: "POST",
      body: { ...credential, nonce: issued.nonce, ...name },
    }),
  );

  await applyOutcome(outcome, startedAt);
  if (appleNameSettled(outcome)) await clearAppleName(appleUserId);

  return { kind: "settled", outcome };
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
 *
 * `name` is spent only if this link goes on to *create* the account. The API
 * stores it beside the token and reads it back at `createUser`, and it never
 * renames someone who already exists -- so a returning person who types one
 * changes nothing, and there is no way to tell them that without answering the
 * question this flow exists not to answer, which is whether the address is
 * already known. It is sent when given and omitted when not, rather than sent
 * empty: the API would accept `""` and store it, and a nameless account is the
 * thing the field is here to prevent.
 */
export async function requestMagicLink(
  email: string,
  name?: string,
): Promise<MagicLinkRequestOutcome> {
  if (MAGIC_LINK_ORIGIN === null) {
    return { kind: "refused", message: MAGIC_LINK_UNCONFIGURED_NOTICE };
  }

  const person = name?.trim() ?? "";

  return interpretMagicLinkRequest(
    await apiRequest(MAGIC_LINK_REQUEST_PATH, {
      method: "POST",
      body: {
        // `identifier`, not `email`, for the reason `signInWithPassword` sends
        // one: `/auth/magic-link` renamed the slot and its body is a
        // `z.strictObject`, so the old key fails twice — the missing
        // `identifier` and the unrecognised `email` — as a 422 before a link is
        // ever generated. The rename landed on both routes; only the password
        // one was followed, so every link request from this client was refused.
        identifier: email.trim(),
        ...(person ? { name: person } : {}),
        url: MAGIC_LINK_ORIGIN,
      },
    }),
  );
}

/** What a new account is made with, as the sign-up step collected it. */
export type SignUpRequest = {
  email: string;
  name: string;
  username: string;
  /** Omitted from the body when blank. */
  phone: string;
  /**
   * The Terms of Use box on the sign-up step. Sent only when true: the API
   * stamps the date onto the account when the link creates it, and an account
   * that arrives without one meets the terms gate on its first sign-in.
   */
  acceptTerms: boolean;
};

/**
 * Ask for a sign-up link: the API keeps the name, username and phone until the
 * link is opened, and opening it creates the account with them.
 *
 * Like `requestMagicLink`, nothing is stored and no credential changes hands,
 * so there is no epoch to capture. Unlike it, the answer may say the address or
 * the username is taken, because the form has to put that on a field.
 */
export async function requestSignUp(input: SignUpRequest): Promise<SignUpOutcome> {
  if (MAGIC_LINK_ORIGIN === null) {
    return { kind: "refused", message: MAGIC_LINK_UNCONFIGURED_NOTICE };
  }

  const phone = input.phone.trim();

  return interpretSignUp(
    await apiRequest(SIGN_UP_PATH, {
      method: "POST",
      body: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        username: input.username.trim().toLowerCase(),
        ...(phone ? { phone } : {}),
        ...(input.acceptTerms ? { acceptTerms: true } : {}),
        url: MAGIC_LINK_ORIGIN,
      },
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
 *
 * And it goes last on the wire as well as last here. Ending the session on the
 * server makes every other request under that cookie impossible, and the wipe
 * has just fired one — the push deregistration, which needs this same credential
 * and is deliberately not waited for. Sent without the gate below, the two race,
 * and the half of the time the logout lands first the device row survives a
 * sign-out that was meant to remove it.
 *
 * Nobody feels the wait: `AuthProvider` has already dispatched the sign-out and
 * moved the screens before this function is called. The session does, which is
 * why the gate gives up after a few seconds rather than after a deadline — see
 * `pushDeregistrationSettled`.
 */
export async function signOut(): Promise<void> {
  const ending = getSessionCookie();

  await forgetCredential();
  // Local, like `forgetCredential`, and before the network call for the same
  // reason. Unconditional: nothing here records how the person signed in, and
  // releasing a session that was never established is a no-op — whereas keeping
  // one would sign the next person on a shared device straight back in.
  await releaseGoogleSession();

  if (ending) {
    // Last, and after the request the wipe fired. See above.
    await pushDeregistrationSettled();
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

/** Whoever needs to know the API refused a request for want of agreed terms. */
const termsListeners = new Set<() => void>();

/**
 * Listen for `terms_required`: the server enforces the terms gate on every
 * request, so a person this device thought had agreed (an older build's kept
 * copy, or an account whose date was cleared) is sent to agree from wherever
 * they are. Returns the way to stop.
 */
export function onTermsRequired(listener: () => void): () => void {
  termsListeners.add(listener);
  return () => {
    termsListeners.delete(listener);
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
/**
 * Take on the Session cookie a request answered with, in place of the one it was sent with.
 *
 * For the one authenticated route that replaces the session under a person who stays signed in:
 * turning two-factor off ends the session the request carried and starts its successor. Keeping
 * the old cookie meant the next request came back 401 and signed the person out.
 *
 * Bound to the epoch the request started in, like every other credential write: a sign-out that
 * landed while the request was in flight wins, and nothing is written behind it.
 */
export async function adoptReplacedSessionCookie(
  outcome: HttpOutcome,
  startedAt: number,
): Promise<void> {
  if (!outcome.reached || !outcome.sessionCookie) return;
  if (startedAt !== credentialEpoch) return;

  setSessionCookie(outcome.sessionCookie);
  await writeSessionCookie(outcome.sessionCookie);
}

/** The current credential epoch, for a caller that will hand it back to `adoptReplacedSessionCookie`. */
export function currentCredentialEpoch(): number {
  return credentialEpoch;
}

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

  // A refusal like any other for the caller — never retried — and the gate for
  // everyone else: the session stands, the person just has to agree first.
  if (saysTermsRequired(outcome) && startedAt === credentialEpoch) {
    for (const listener of termsListeners) listener();
  }

  return outcome;
}
