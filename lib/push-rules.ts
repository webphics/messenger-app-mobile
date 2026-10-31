import { asRecord } from '@/lib/api-envelope'
import { isOutgoing, isSystemMessage } from '@/lib/thread-state'
import type { Message } from '@/lib/types'

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

/** Every moment that asks, so a rule can be written over all of them at once. */
export const PERMISSION_TRIGGERS: PermissionTrigger[] = ['sign-in', 'message']

/** Everything the decisions below read except which moment is asking. */
export type PermissionStanding = {
  status: PushPermission
  /**
   * Whether the platform would still draw the dialog. The load-bearing field:
   * see the note above on why the status is not.
   */
  canAskAgain: boolean
  /**
   * Whether the dialog has ever been raised on this device — a fact about the
   * installation, because that is the scope the platform's own once is. It
   * survives a Session end for the same reason: the dialog does.
   */
  askedBefore: boolean
}

export type PermissionAsk = PermissionStanding & { trigger: PermissionTrigger }

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
 * Whether an arriving Message is one of the moments that asks.
 *
 * The half of the second trigger that is about the Message rather than about
 * the platform: a reply landing from somebody else is the question answering
 * itself, and the two kinds that are not are this viewer's own message and a
 * System notice. Both are the app talking about itself — nobody is watching for
 * either, and neither is a reason to put a dialog in front of anybody.
 *
 * Whether the app is actually in front of the person is not asked here, because
 * that is not a fact about the Message; `PushRegistration` reads it.
 */
export function shouldAskOnMessage(message: Message, viewerId: string): boolean {
  return !isSystemMessage(message) && !isOutgoing(message, viewerId)
}

/**
 * Whether Settings should offer a route into the operating system's own
 * notification settings.
 *
 * The one place the answer can still be changed, offered exactly when it is the
 * *only* place: notifications are not on, and no moment this app has left will
 * put the dialog in front of anybody again. Which is why this is defined against
 * the table above rather than as `status === 'denied'` — the two are not the
 * same set at either end.
 *
 * A phone that has never been asked reports `denied` on Android and is not
 * offered this, because the ask is still coming and a person sent to system
 * settings before ever seeing the dialog has been asked to do by hand what the
 * app was about to do for them. And somebody who dismissed the dialog once is
 * offered it while the platform still says `canAskAgain` — that field is about
 * whether a dialog would be *drawn*, and `askedBefore` is what says it already
 * has been. Nothing here nags: it is a row on a screen somebody chose to open.
 */
export function shouldOfferSystemSettings(standing: PermissionStanding): boolean {
  if (standing.status === 'granted') return false
  return PERMISSION_TRIGGERS.every(
    (trigger) => !shouldAskForPermission({ ...standing, trigger }),
  )
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
 * Every reader below takes the whole thing it was handed rather than the part of
 * it it wants, so that the digging is table-tested too:
 * `notification.request.content` is three shapes deep and each of them is a
 * place a dispatch can be wrong. It is also why `push-device` knows none of this
 * shape, despite owning the module the responses come from.
 */

/** The `request` a notification carries, or null when it is not one. */
function requestOfNotification(notification: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(notification)?.request)
}

/** The `request` a response carries, or null when the response is not one. */
function requestOf(response: unknown): Record<string, unknown> | null {
  return requestOfNotification(asRecord(response)?.notification)
}

/** The conversation a notification is about, wherever it is being read from. */
function conversationOf(request: Record<string, unknown> | null): string | null {
  return asId(asRecord(asRecord(request?.content)?.data)?.conversationPublicId)
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
  return conversationOf(requestOf(response))
}

/**
 * Where a tap on a notification about no conversation goes. A conversation's tap is
 * `conversationIdFromPush`, and opens the thread; these are the kinds the app has no
 * notification list for, so their push is the only place they are ever seen.
 */
export type PushRoute =
  | { screen: 'wall-post'; postId: string }
  | { screen: 'invitations' }
  | { screen: 'conversations' }
  /** The Admin's report queue, for a `content_reported` push. */
  | { screen: 'reports' }

/** The route a notification's payload names, or null for one this build has none for. */
function routeOf(request: Record<string, unknown> | null): PushRoute | null {
  const data = asRecord(asRecord(request?.content)?.data)
  if (!data) return null
  // A thread is the answer whenever one is named, whatever the kind.
  if (asId(data.conversationPublicId)) return null

  switch (data.kind) {
    case 'wall_post':
    case 'wall_post_reaction': {
      const postId = asId(data.wallPostPublicId)
      return postId ? { screen: 'wall-post', postId } : null
    }
    case 'organization_invitation':
      return { screen: 'invitations' }
    case 'customer_registered':
    case 'customer_joined_organization':
      return { screen: 'conversations' }
    case 'content_reported':
      return { screen: 'reports' }
    default:
      return null
  }
}

/**
 * The screen a tapped notification about no conversation asks for, or null: for a
 * conversation's notification (that is `conversationIdFromPush`), and for a dispatch this
 * build cannot read, which leaves the launch going where it was going.
 */
export function pushRouteFromPush(response: unknown): PushRoute | null {
  return routeOf(requestOf(response))
}

/**
 * The same, read off a notification arriving rather than one tapped.
 */
export function pushRouteFromNotification(notification: unknown): PushRoute | null {
  return routeOf(requestOfNotification(notification))
}

/**
 * Kinds that name a conversation but that nothing in the app draws when they arrive: a new
 * Message moves its row and raises the In-app banner, a reaction does neither, and nor does an
 * Invitation card, which is a `system` message the banner never announces.
 */
const UNDRAWN_CONVERSATION_KINDS: readonly string[] = ['message_reaction', 'organization_invitation']

/**
 * Whether the platform should draw this notification while the app is open: true for the
 * kinds nothing in the app draws (every routed kind, and a reaction on a Message), false for
 * the Message kinds the app already tells somebody about itself.
 */
export function platformDrawsInForeground(notification: unknown): boolean {
  const request = requestOfNotification(notification)
  if (routeOf(request) !== null) return true
  const kind = asRecord(asRecord(request?.content)?.data)?.kind
  return typeof kind === 'string' && UNDRAWN_CONVERSATION_KINDS.includes(kind)
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

/**
 * The conversation an Android notification names in its tag.
 *
 * The second way to read one, and on the one platform this ships to it is the
 * only way. Expo's push service sends an FCM `notification` block so that a
 * closed phone draws something at all — which means Firebase draws it, before
 * any code of this app's runs, and what `getPresentedNotificationsAsync` hands
 * back for one of those is the *Android* notification: a title, a body, and
 * none of the payload. The dispatch is not lost, it was never in the thing being
 * read.
 *
 * So the routing travels somewhere the platform does keep: the notification's
 * tag, which the API sets to `<conversation>:<notification>` and which
 * `expo-notifications` hands back inside the identifier it makes for a
 * notification it did not post itself. Unique per notification, so nothing in a
 * thread collapses into anything else; prefixed by the conversation, so the
 * shade can be read a thread at a time.
 *
 * Anything else parses to something that is not a conversation id and therefore
 * matches nothing — the tag Firebase invents for itself, `FCM-Notification:<n>`,
 * included.
 */
function conversationFromTag(identifier: unknown): string | null {
  if (typeof identifier !== 'string') return null

  const tag = /[?&]tag=([^&]*)/.exec(identifier)?.[1]
  if (tag === undefined) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(tag)
  } catch {
    // A tag that is not valid percent-encoding is not one this app wrote.
    return null
  }

  const separator = decoded.indexOf(':')
  return separator > 0 ? decoded.slice(0, separator) : null
}

/**
 * Which of the notifications standing in the shade belong to one conversation.
 *
 * The third thing read off a payload, and the only one that is not about a tap:
 * a shade holding three notifications for a thread somebody has just read is a
 * second unread count, disagreeing with the badge that has already gone. What
 * clears them is the read itself — see `dismissConversationNotifications` — and
 * this is the part of it that can be written a table for.
 *
 * Every notification is walked the way a tap is, and one that cannot be read is
 * simply not matched: a dispatch this build does not understand is not a reason
 * to clear somebody else's, and clearing more than the conversation named would
 * be the same disagreement in the other direction.
 */
export function notificationIdsForConversation(
  presented: unknown,
  conversationId: string,
): string[] {
  if (!Array.isArray(presented) || conversationId === '') return []

  const ids: string[] = []
  for (const notification of presented) {
    const request = requestOfNotification(notification)
    // The payload first, because it is the truth when it survived; the tag when
    // it did not, which on Android is every notification drawn while this app
    // was not running.
    const named = conversationOf(request) ?? conversationFromTag(request?.identifier)
    if (named !== conversationId) continue

    const id = asId(request?.identifier)
    if (id !== null) ids.push(id)
  }
  return ids
}
