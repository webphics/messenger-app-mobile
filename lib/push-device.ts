import { File, Paths } from 'expo-file-system'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import type { PushPlatform } from '@/lib/conversation-api'
import {
  shouldAskForPermission,
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
