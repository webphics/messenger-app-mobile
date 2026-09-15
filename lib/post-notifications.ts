import { shouldOfferSystemSettings, type PermissionStanding } from '@/lib/push-rules'
import type { NotificationSettings, Organization } from '@/lib/types'

/**
 * Which organizations may notify this person about a Post, and what the switches
 * cannot promise on a phone whose notifications are off.
 *
 * Pure and table-tested, beside `lib/use-post-notifications`, which owns the
 * requests, and `components/settings/post-notifications-card`, which draws them
 * — the same split as everywhere else.
 *
 * ## Why a switch rather than a mute
 *
 * Everything else the API keeps about notifying somebody is worded the other way
 * round: a Broadcast reaches everyone who has not opted out, a thread notifies
 * until it is muted, and an *essential* Broadcast overrides the opt-out
 * altogether. A Post has none of that. It notifies only the organizations
 * somebody has named, the list starts empty, and there is no kind of Post that
 * reaches past it — which is not a restraint this client applies but the shape
 * of the setting: an organization is on because it is in the list, and the list
 * is the only thing consulted. That is the whole of `postNotificationRows`, and
 * it is why nothing here takes a Post, a priority or an organization's own
 * fields: there is nowhere for an override to be read from.
 */

/** One organization's switch, as the card draws it. */
export type PostNotificationRow = {
  id: string
  name: string
  /** Whether Posts from this organization may notify this person. */
  on: boolean
}

/**
 * A switch per organization somebody belongs to, in the order the memberships
 * arrived.
 *
 * Membership is what the list is drawn from and the opt-in is only what sets a
 * switch, so an organization named in the settings that this person has since
 * left draws nothing — the API answers the same way, and a row for an
 * organization somebody cannot see would be a claim about a Wall they cannot
 * read.
 */
export function postNotificationRows(
  organizations: Organization[],
  settings: NotificationSettings | null,
): PostNotificationRow[] {
  const on = new Set(settings?.postOrganizationIds ?? [])
  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    on: on.has(organization.id),
  }))
}

/**
 * What the card has to say about the phone rather than about the organizations,
 * or null when there is nothing to add.
 *
 * A switch that is on and a phone that draws nothing are not a contradiction the
 * person can see, and the switch would be lying by omission: it is a standing
 * answer kept by the API, and it will be true the moment the operating system
 * lets anything through. So a person whose notifications are not on is told both
 * halves — what turning one on does record, and what it will not do until
 * notifications are — rather than being left to read a working switch as a
 * working notification.
 *
 * Two sentences rather than one, because "notifications are turned off" is a
 * claim about somebody's answer and is false on a phone nobody has asked yet —
 * which on Android is indistinguishable from a refusal by the status alone, and
 * is why this reads the same standing the ask does rather than the status. Where
 * a moment that asks is still coming, the line says only that they are not on
 * yet; where none is, it says they are off and is the only one that does. That
 * second case is exactly when `NotificationPermissionRow` draws itself beneath
 * this card, so the sentence that reports a closed door is the one with the way
 * out under it, and nothing here is a dead end. It is also why that sentence does
 * not say notifications are *off*: the row below says exactly that, in those
 * words, and on the emulator the two read as one sentence printed twice. So this
 * one says what it alone knows — what it means for a Post — and leaves the state
 * of the platform to the card that can do something about it. Nothing here asks, either: the
 * two moments that do are elsewhere, and this is a card on a screen somebody
 * chose to open.
 */
export function postNotificationCaveat(standing: PermissionStanding): string | null {
  if (standing.status === 'granted') return null

  return shouldOfferSystemSettings(standing)
    ? 'A Post will not reach this phone while notifications are off. ' +
        'A switch you turn on is still kept, and it takes effect as soon as they are on.'
    : 'Notifications are not on for Enki yet, so a Post will not reach this phone. ' +
        'A switch you turn on is still kept, and it takes effect as soon as they are on.'
}
