import { File, Paths } from 'expo-file-system'

import { apiRequest } from '@/lib/api-client'

/**
 * What this device told the API to dispatch to, and how it takes that back.
 *
 * Split off `lib/push-device` rather than sitting in it, and the line between
 * them is the native import rather than anything about what they do — both write
 * a small record under `Paths.cache`. That module is the one place
 * `expo-notifications` is imported; this one never touches it, which is what
 * keeps a Session end from dragging the whole notifications native side in
 * behind it, since `lib/session-wipe` reaches this and `lib/auth-service`
 * reaches that.
 *
 * Nothing here throws. Every ending is a row the API keeps for a while longer,
 * which the next registration on this phone takes over.
 */

/**
 * The token this installation last told the API to dispatch against.
 *
 * Under `Paths.cache`, like `PUSH_PERMISSION_ASKED_FILE` next door and for the
 * same two reasons, which land the same way round here. It has to outlive a
 * Session end, because that is the moment it is read: the row it names is
 * removed *as* the session ends, and a record living in the Store would be
 * destroyed by the wipe standing next to the request that needs it. And it must not outlive the install,
 * because a token is issued to an installation — a copy riding a backup onto
 * another phone names a row that phone does not own, and the `DELETE` is
 * owner-scoped, so it would simply remove nothing.
 *
 * Written by every registration rather than only by one that was acknowledged: a
 * request whose answer was lost may well have written the row, and the cheap
 * direction is a `DELETE` that removes nothing rather than a row nobody deletes.
 *
 * Removed only by a `DELETE` the API accepted, which is what leaves a
 * deregistration that failed something to retry — the next Session end, since
 * there is no timer here and no loop, the same as the registration beside it.
 */
export const PUSH_REGISTERED_TOKEN_FILE = 'push-registered-token'

/**
 * The deregistration that is still going, or the last one that went.
 *
 * A module-level slot rather than a return value threaded up, because the only
 * thing that wants it is `signOut` and the only path between them runs through
 * `forgetCredential` and `endSessionOnDevice` — neither of which has any use for
 * it, and both of which would have to carry it in their signature for the one
 * caller in four that does.
 *
 * Overwritten rather than accumulated: a second Session end while one is still
 * going is a session that ended twice, and the gate wants the latest of them.
 */
let inFlight: Promise<void> = Promise.resolve()

/** Where the last registered token is kept. See the constant above. */
function registeredTokenFile(): File {
  return new File(Paths.cache, PUSH_REGISTERED_TOKEN_FILE)
}

/**
 * Record that this installation now has a row in the API's device table.
 *
 * Called by the registration rather than by `readPushToken`, because a token
 * read and never sent names no row.
 */
export function rememberPushRegistration(token: string): void {
  try {
    registeredTokenFile().write(token)
  } catch {
    // The record stays where it was. The cost is a row this device will not
    // think to remove, which the next registration takes over anyway.
  }
}

/** The token this installation last registered, or null. */
function readRegisteredToken(): string | null {
  try {
    const file = registeredTokenFile()
    if (!file.exists) return null

    const token = file.textSync().trim()
    return token === '' ? null : token
  } catch {
    return null
  }
}

function forgetPushRegistration(): void {
  try {
    const file = registeredTokenFile()
    if (file.exists) file.delete()
  } catch {
    // Left behind, which costs one `DELETE` that removes nothing next time.
  }
}

/**
 * Take this device's token out of the API's table, so a session that has ended
 * stops being dispatched to.
 *
 * The third thing a Session end destroys, and the only one that is not on this
 * phone — see `lib/session-wipe`, which is the one path all three moments reach.
 *
 * ## Why the cookie is an argument
 *
 * Because by the time this runs there is no held one. A Session end discards the
 * credential locally first and always has, so that a slow logout cannot leave a
 * live cookie attached to whatever the person does next; the ending cookie is
 * captured before that and handed here, exactly as it is handed to
 * `POST /auth/logout`. A `null` is a moment with nothing to authenticate with —
 * a cold start that found no cookie, a refused sign-in — and there is no request
 * to make.
 *
 * ## Why it goes through `apiRequest` rather than `conversation-api`
 *
 * Every other call in this app is an `authenticatedRequest`, and this one must
 * not be. That wrapper ends the session on a `401`, and this runs *inside* a
 * Session end: a credential the server has already refused would re-enter the
 * path that called it. It presents its own cookie for the same reason.
 *
 * ## What a failure means
 *
 * Nothing, here. It never throws, nothing on this device waits for it, and it
 * says nothing on any screen. The one thing that does wait is the logout a
 * sign-out sends afterwards, and only so it cannot overtake this — see
 * `pushDeregistrationSettled`; the screens have already moved by then. A Session expiry is the case worth naming: the
 * cookie is dead by definition, so the `DELETE` earns a second `401` and the row
 * survives — until the next person to sign in on this phone registers, which
 * takes the row over rather than adding one. The record above is kept on a
 * failure so the next Session end tries again.
 */
export function deregisterPushDevice(cookie: string | null): Promise<void> {
  inFlight = removeDevice(cookie)
  return inFlight
}

/**
 * How long a sign-out will hold its logout back for the `DELETE` above.
 *
 * Deliberately far shorter than a Request deadline, because this is not a bound
 * on the request — that one already has one, four of them in the pathological
 * case. It is a bound on how long the *session on the server* may be left alive
 * to buy the ordering below, and past a couple of seconds that trade goes the
 * wrong way round: a live session reads somebody's conversations, and a live
 * device row shows a preview until the next person to sign in takes it over.
 *
 * So it is sized to the case it exists for — a healthy phone, a pre-flight and
 * a `DELETE` — rather than to the case where nothing is going to work anyway. A
 * network slow enough to exceed this is one where the logout is unlikely to
 * land either.
 */
const LOGOUT_HELD_FOR_MS = 4_000

/**
 * Wait for the deregistration this Session end fired, but not for long.
 *
 * There is one caller and one reason for it: signing out ends the session on the
 * server, and that request makes every other one impossible — including the
 * `DELETE` above, which the wipe fired a moment earlier under the same cookie
 * and does not wait for. Sent without this, the two race for the last moments of
 * a session the client has already given up, and which of them the API sees
 * first is a coin toss; the losing half of the time, the row survives the
 * sign-out that was supposed to remove it.
 *
 * So `signOut` waits here before telling the server, and nowhere else does: a
 * Session expiry has no logout to send, and nothing else ends a session with a
 * request of its own. It costs the person nothing, because a sign-out has
 * already changed the screens by the time any of this runs — see `signOut`.
 *
 * It costs the *session* something, which is why it is bounded. Giving up here
 * abandons only the ordering: the `DELETE` is still going, and may still land
 * first or land uselessly, but the logout stops waiting to find out.
 *
 * Answers at once when nothing is in flight, which is every moment but this one.
 */
export async function pushDeregistrationSettled(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      inFlight,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOGOUT_HELD_FOR_MS)
      }),
    ])
  } finally {
    // Or the bound outlives the thing it was bounding, and holds a timer open
    // on every sign-out that did not need one.
    clearTimeout(timer)
  }
}


async function removeDevice(cookie: string | null): Promise<void> {
  try {
    const token = readRegisteredToken()
    if (!token || !cookie) return

    const outcome = await apiRequest('/push/devices', {
      method: 'DELETE',
      body: { token },
      cookie,
    })

    if (outcome.reached && outcome.status >= 200 && outcome.status < 300) {
      forgetPushRegistration()
    }
  } catch {
    // See above: a Session end is not failed by this.
  }
}
