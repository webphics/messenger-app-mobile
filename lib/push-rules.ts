import { asRecord } from '@/lib/api-envelope'

/**
 * The two decisions about a Push notification that are not about the platform:
 * whether this app may put the operating system's permission dialog in front of
 * somebody, and what an arriving payload means.
 *
 * Both are tables, and both are pure and import nothing native, so the parts
 * most likely to be got wrong are the ones with no mocks in front of them.
 * `lib/push-device` next door owns `expo-notifications` and does what this says
 * — the same split as `store-rows`/`conversation-store` and
 * `attachment-budget`/`attachment-cache`.
 *
 * # The permission
 *
 * When the dialog may be raised, decided from what the platform already says,
 * which moment is asking, and whether this device has ever asked at all.
 *
 * ## Why a guard at all
 *
 * Android 13+ and iOS each draw the system dialog once. A request after that is
 * refused without drawing anything, so an unguarded trigger is not a second
 * chance — it is a no-op shaped like a prompt, and a person who never sees it
 * cannot tell it from the app not asking. Every rule here exists to keep the one
 * dialog for the one moment somebody can actually answer it.
 *
 * ## Why `denied` is not the refusal it reads as
 *
 * The obvious rule — ask only while the status is `undetermined` — is wrong on
 * the one platform this ships to, and wrong in the direction that draws nothing
 * at all. `expo-notifications` answers Android 13+ by reading
 * `areNotificationsEnabled()` before the runtime permission, and that is false
 * on a fresh install, so a phone nobody has ever asked reports `denied`. It was
 * a silent no-op on the emulator until it was watched for.
 *
 * So the platform's status is not what decides this. `canAskAgain` is: it is the
 * platform saying whether a request would draw a dialog at all, and it is false
 * exactly when one would not — refused twice on Android, refused once on iOS,
 * or turned off in settings. What it cannot say is whether the one dialog it
 * would still draw has already been drawn, because Android reports a dismissal
 * and a single refusal identically. That is the whole job of `askedBefore`.
 */

/** Where the platform stands, as `expo-notifications` reports it. */
export type PushPermission = 'undetermined' | 'granted' | 'denied'

/**
 * The moments that ask.
 *
 * `sign-in` is the common case and costs nothing to place: somebody has just
 * signed in and there is no screen to interrupt. `message` is the one that earns
 * it — a reply landing in front of somebody is the question answering itself —
 * and it exists for whoever the first never reached, never as a second ask.
 */
export type PermissionTrigger = 'sign-in' | 'message'

export type PermissionAsk = {
  status: PushPermission
  /**
   * Whether the platform would still draw the dialog. The load-bearing field:
   * see the note above on why the status is not.
   */
  canAskAgain: boolean
  trigger: PermissionTrigger
  /**
   * Whether the dialog has ever been raised on this device — a fact about the
   * installation, because that is the scope the platform's own once is. It
   * survives a Session end for the same reason: the dialog does.
   */
  askedBefore: boolean
}

export function shouldAskForPermission({
  status,
  canAskAgain,
  trigger,
  askedBefore,
}: PermissionAsk): boolean {
  // Nothing left to ask for.
  if (status === 'granted') return false

  // The platform has closed the question. Deliberately the only thing that
  // reads as a refusal here — `denied` on its own does not, because on Android
  // that is also what never-asked looks like.
  if (!canAskAgain) return false

  // Exhaustive rather than a membership test, so a third trigger has to answer
  // this question rather than inheriting an answer. Both of today's answer
  // alike: undetermined-and-already-asked is a dialog somebody dismissed, and
  // raising it again is what the platform refuses to draw.
  switch (trigger) {
    case 'sign-in':
    case 'message':
      return !askedBefore
  }
}

/**
 * # The payload
 *
 * What a tapped notification means, read the way `realtime-events` reads the
 * other transport: every step of the walk is a check rather than an assumption,
 * and anything unexpected answers null rather than throwing. A dispatch arrives
 * from a server this app does not control, at the one moment this app has
 * nothing else on screen — a malformed one must not be able to break a launch.
 *
 * Both readers below take the whole response rather than the part of it they
 * want, so that the digging is table-tested too: `notification.request.content`
 * is three shapes deep and each of them is a place a dispatch can be wrong. It
 * is also why `push-device` knows none of this shape, despite owning the module
 * the response comes from.
 */

/** The `request` a response carries, or null when the response is not one. */
function requestOf(response: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(asRecord(response)?.notification)?.request)
}

/** A field that is a usable id, or null — an empty string is not one. */
function asId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The conversation a tapped notification is about, or null for a dispatch this
 * build cannot read.
 *
 * Null is not an error. The API's own payload type says `conversationPublicId`
 * is nullable — a kind that is not about a conversation dispatches with none —
 * and a tap on one of those has nowhere to go but where the launch was already
 * going.
 */
export function conversationIdFromPush(response: unknown): string | null {
  const content = asRecord(requestOf(response)?.content)
  return asId(asRecord(content?.data)?.conversationPublicId)
}

/**
 * What the platform calls this notification, or null when it does not say.
 *
 * The one thing about a tap that is not about where it goes: the response that
 * starts a cold launch is reachable both from the read and from a listener
 * registered early enough, and this is how `push-device` tells the second
 * report of one tap from a second tap. Read here rather than there so that the
 * walk down to it stays in the module the walk is tested in.
 */
export function notificationIdFromPush(response: unknown): string | null {
  return asId(requestOf(response)?.identifier)
}
