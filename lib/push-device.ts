import { File, Paths } from 'expo-file-system'
import * as Notifications from 'expo-notifications'
import { Linking, Platform } from 'react-native'

import type { PushPlatform } from '@/lib/conversation-api'
import {
  conversationIdFromPush,
  notificationIdFromPush,
  notificationIdsForConversation,
  shouldAskForPermission,
  shouldOfferSystemSettings,
  type PermissionStanding,
  type PermissionTrigger,
  type PushPermission,
} from '@/lib/push-rules'

/**
 * The only module in this app that imports `expo-notifications`.
 *
 * Everything native about a Push notification is here — the permission dialog,
 * the Android channel, and the token Expo's push service dispatches against —
 * and the decision about *when* the dialog may be raised is not: that is
 * `lib/push-rules`, pure and table-tested beside it. The split is the one
 * `store-rows`/`conversation-store` and `attachment-budget`/`attachment-cache`
 * already make, and for the same reason: a native module is the one thing this
 * repo cannot assert anything about without a device.
 *
 * Nothing here throws and nothing here fails a screen. A person who refuses the
 * permission, a phone with no signal when the token is read, a build with no
 * native side at all — each ends with no registration and an app that works
 * exactly as it does without any of this.
 */

/**
 * Nothing the operating system draws while this app is in front of the person.
 *
 * The handler is asked about a dispatch that arrives in the foreground and
 * nothing else — a phone that is asleep or behind another app never reaches
 * here, which is the case a Push notification exists for. So the answer is a
 * constant rather than a decision: while somebody is looking at this app, this
 * app is what tells them, through the row that has already moved, the tab badge
 * beside it, and the In-app banner that says which of them it was.
 *
 * That covers both foreground cases at once and is why neither needs to be
 * distinguished here. A Message for the thread on screen is already drawn as a
 * bubble; one for another thread gets the strip. Drawing the platform's own
 * surface over either would be the app reporting something the person can see,
 * and on the thread they are reading, telling them what they are reading.
 *
 * Set at module scope, because the handler has to be registered before a
 * dispatch arrives rather than when a screen gets around to mounting, and Expo
 * documents it that way. Guarded like everything else here: a build with no
 * native side has no handler to set and is not failed by saying so.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
} catch {
  // No native module to hand this to. Nothing arrives, so nothing is drawn.
}

/**
 * Whether the dialog has ever been raised on this installation.
 *
 * A file under `Paths.cache`, which is a choice about two different things.
 *
 * It has to outlive a Session end, so it cannot go in the Store: the platform's
 * own *once* is scoped to the app rather than to whoever is signed into it, and
 * a wipe that took this with it would put the dialog back in front of the next
 * person on this phone — where the platform would refuse to draw it.
 *
 * And it must not outlive the *install*, which is what rules out the ordinary
 * stores. Neither platform backs up the cache — the reason ADR-0011's guard
 * points here, and why the downloaded documents already live here — so a phone
 * restored from a backup arrives without it. That is the honest answer: the
 * restored device has never asked, its permission is undetermined, and it must
 * be asked. A copy of this flag riding a backup across would have made push
 * silently never work there, with nothing on screen to say so.
 *
 * The cost of the cache is that the system may reclaim it, which costs one
 * dialog on a device that has already seen one. That is the same way round as
 * an unreadable read below, and the cheap direction of the two.
 */
export const PUSH_PERMISSION_ASKED_FILE = 'push-permission-asked'

/**
 * The channel a dispatch may name, created before there is a token to dispatch
 * against.
 *
 * Android fixes a channel's importance at the moment it is created and will not
 * draw a notification naming a channel that does not exist, so the registration
 * is the only place this can happen. `default` is the id Expo's own push service
 * and documentation name; a dispatch that names none draws on the fallback
 * channel `expo-notifications` creates for itself.
 *
 * A no-op off Android — the module answers null there rather than needing a
 * platform test here.
 */
const CHANNEL_ID = 'default'

/** Which half of the API's `platform` this installation is. */
export const PUSH_PLATFORM: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android'

/**
 * The platform's answer, read as one of the three this app knows.
 *
 * Anything else is undetermined rather than a fourth state: iOS has two more
 * authorizations of its own, and neither is a person having said no.
 */
function asPermission(status: string): PushPermission {
  return status === 'granted' || status === 'denied' ? status : 'undetermined'
}

/**
 * The two fields the decision is made from, together because neither answers on
 * its own — see `lib/push-rules` on why the status alone is not enough.
 */
type PermissionState = { status: PushPermission; canAskAgain: boolean }

/** A platform that cannot be read has decided nothing and closed nothing. */
const UNREADABLE: PermissionState = { status: 'undetermined', canAskAgain: true }

async function readPermission(): Promise<PermissionState> {
  try {
    const answer = await Notifications.getPermissionsAsync()
    return { status: asPermission(answer.status), canAskAgain: answer.canAskAgain }
  } catch {
    return UNREADABLE
  }
}

/** Whether this installation has ever raised the dialog. */
function hasAsked(): boolean {
  try {
    return new File(Paths.cache, PUSH_PERMISSION_ASKED_FILE).exists
  } catch {
    // Indistinguishable from never having asked, which is the safe way round:
    // it costs one dialog rather than costing notifications for good.
    return false
  }
}

function rememberAsked(): void {
  try {
    new File(Paths.cache, PUSH_PERMISSION_ASKED_FILE).write('asked')
  } catch {
    // The record stays where it was: unwritten, so the next launch asks again.
  }
}

/**
 * Raise the permission dialog if this moment is one that should, and answer
 * where the permission stands afterwards.
 *
 * The record of the ask is written only when the dialog actually resolved, so a
 * request that could not be made at all is still owed rather than spent.
 */
export async function ensurePushPermission(
  trigger: PermissionTrigger,
): Promise<PushPermission> {
  const { status, canAskAgain } = await readPermission()
  if (!shouldAskForPermission({ status, canAskAgain, trigger, askedBefore: hasAsked() })) {
    return status
  }

  let answered: PushPermission
  try {
    answered = asPermission((await Notifications.requestPermissionsAsync()).status)
  } catch {
    return status
  }

  rememberAsked()
  return answered
}

/**
 * Where the platform stands, for a screen that has to say something true about
 * what will actually arrive.
 *
 * The whole standing rather than the status, because the status alone cannot
 * tell a refusal from a phone nobody has asked — see `lib/push-rules`, which is
 * where every question about it is answered. Nothing acts on this: the card in
 * `components/settings/post-notifications-card` puts a sentence under its
 * switches, and which sentence is `postNotificationCaveat`'s reading of exactly
 * the standing the ask is guarded on, so the two cannot drift apart.
 *
 * A platform that cannot be read says nothing has been decided and nothing has
 * been closed, the same value every other read here is taken under.
 */
export async function readNotificationStanding(): Promise<PermissionStanding> {
  const { status, canAskAgain } = await readPermission()
  return { status, canAskAgain, askedBefore: hasAsked() }
}

/**
 * Whether the only place left to turn notifications on is the operating
 * system's own settings.
 *
 * Read on a screen rather than acted on: `lib/push-rules` decides it, and what
 * it decides is whether Settings shows a row at all. Asked again whenever this
 * app comes back to the foreground, because the answer changes while it is not
 * running — which is the whole point of sending somebody out to change it.
 *
 * A platform that cannot be read says nothing has been decided and nothing has
 * been closed, which is the same value the ask is read under and the quiet
 * answer on a device nobody has asked: no row. A build with no native side has
 * nothing to offer a route into anyway.
 */
export async function needsSystemNotificationSettings(): Promise<boolean> {
  const { status, canAskAgain } = await readPermission()
  return shouldOfferSystemSettings({ status, canAskAgain, askedBefore: hasAsked() })
}

/**
 * Open the operating system's settings for this app.
 *
 * Both platforms land on the app's own page, one tap from its notifications —
 * there is no deeper destination `Linking` can name on iOS, and one page for
 * both is the honest thing to write a label against. Nothing here throws and
 * nothing waits on it: a platform that refuses leaves the person on Settings,
 * where they already were.
 */
export async function openSystemNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings()
  } catch {
    // Nothing to say and nowhere to say it. See the note above.
  }
}

/**
 * The Expo token this installation is dispatched against, or null.
 *
 * Reading it is a request to Expo's servers, so it fails on a phone with no
 * signal — which is a registration skipped rather than anything a person sees.
 * The next launch reads it again, and has to: a token rotates, and a stale row
 * dispatches into nothing.
 */
export async function readPushToken(): Promise<string | null> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    })

    return (await Notifications.getExpoPushTokenAsync()).data
  } catch {
    return null
  }
}

/**
 * The notification that started this launch, once it has been handed on.
 *
 * The response a tap cold-starts the app with is reachable from both sides: the
 * read below, and a listener registered early enough that the platform hands it
 * the same response. Which of the two arrives first is not this app's to decide,
 * and a thread opened twice is a thread somebody has to press Back through
 * twice — so the launch's own tap is remembered here and the listener drops it
 * once.
 *
 * Once, and only that one: it is cleared as it is used, so a person who taps the
 * same notification again later is not silently ignored. Nothing else is
 * remembered, because nothing else is reported twice.
 */
let launchTap: string | null = null

/**
 * The conversation a tap that started this launch asked for, or null.
 *
 * Read rather than listened for, because a cold start has nowhere to deliver an
 * event to: the process is still coming up while the platform is reporting the
 * tap, and a listener that has not been registered yet misses it. The Launch
 * gate takes this as its third input — see `lib/launch-route`.
 *
 * *Take* rather than read: it records the notification so the listener does not
 * hand the same tap on again. Which is also why it answers null on a build with
 * no native side rather than throwing — a throw here would be a launch that
 * never happens, a worse failure than a tap that lands on the Hub.
 */
export function takeTappedConversation(): string | null {
  try {
    const response = Notifications.getLastNotificationResponse()
    const conversationId = conversationIdFromPush(response)
    if (conversationId === null) return null

    launchTap = notificationIdFromPush(response)
    return conversationId
  } catch {
    return null
  }
}

/**
 * Subscribe to taps while the app is running. Answers the unsubscribe.
 *
 * These never reach the Launch gate — there is no launch to gate, and the person
 * is already somewhere — so what this feeds is a navigation rather than a
 * decision about where a launch lands.
 */
export function addPushTapListener(
  onTap: (conversationId: string) => void,
): () => void {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const conversationId = conversationIdFromPush(response)
        if (conversationId === null) return

        // The launch's own tap, reported a second time. Forgotten as it is
        // dropped: the next report of this notification is a person tapping it
        // again, and that one opens the thread.
        const notificationId = notificationIdFromPush(response)
        if (notificationId !== null && notificationId === launchTap) {
          launchTap = null
          return
        }

        onTap(conversationId)
      },
    )
    return () => subscription.remove()
  } catch {
    // No native side to subscribe to: nothing arrives, and taking back a
    // subscription that was never made is a no-op rather than a throw.
    return () => {}
  }
}

/**
 * Take one conversation's notifications out of the shade.
 *
 * Called by the read itself rather than by a screen — `markRead` in
 * `lib/conversation-inbox` is the one funnel every read runs through, whether
 * the thread was opened from the app or from the notification that is being
 * cleared — so there is one call site and no way to open a thread that misses
 * it.
 *
 * Only that conversation's, which is `notificationIdsForConversation`'s whole
 * job: a shade cleared wholesale would hide threads nobody has looked at, and
 * the disagreement with the badge this exists to fix would simply change
 * direction.
 *
 * Nothing waits for it and nothing is failed by it. A shade that cannot be read
 * is a notification somebody dismisses by hand, which is what they did before
 * any of this.
 */
export async function dismissConversationNotifications(
  conversationId: string,
): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    await Promise.all(
      notificationIdsForConversation(presented, conversationId).map((id) =>
        Notifications.dismissNotificationAsync(id),
      ),
    )
  } catch {
    // See above. The shade keeps what it holds.
  }
}
