import {
  postNotificationCaveat,
  postNotificationRows,
} from '@/lib/post-notifications'
import type { PermissionStanding } from '@/lib/push-rules'
import type { NotificationSettings, Organization } from '@/lib/types'

const ACME: Organization = { id: 'org_1', name: 'Acme' }
const BOREALIS: Organization = { id: 'org_2', name: 'Borealis' }

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    broadcastOptOut: false,
    mutedConversationIds: [],
    postOrganizationIds: [],
    ...overrides,
  }
}

describe('postNotificationRows', () => {
  test('draws a switch for every organization somebody belongs to', () => {
    expect(postNotificationRows([ACME, BOREALIS], settings())).toEqual([
      { id: 'org_1', name: 'Acme', on: false },
      { id: 'org_2', name: 'Borealis', on: false },
    ])
  })

  test('is off by default: settings that have never been touched turn nothing on', () => {
    const rows = postNotificationRows([ACME, BOREALIS], settings())
    expect(rows.every((row) => !row.on)).toBe(true)
  })

  test('is off while the settings have not arrived', () => {
    expect(postNotificationRows([ACME], null)).toEqual([
      { id: 'org_1', name: 'Acme', on: false },
    ])
  })

  test('turns on exactly the organizations named in the opt-in list', () => {
    const rows = postNotificationRows(
      [ACME, BOREALIS],
      settings({ postOrganizationIds: ['org_2'] }),
    )
    expect(rows).toEqual([
      { id: 'org_1', name: 'Acme', on: false },
      { id: 'org_2', name: 'Borealis', on: true },
    ])
  })

  test('keeps the order the memberships arrived in', () => {
    expect(postNotificationRows([BOREALIS, ACME], settings()).map((row) => row.id)).toEqual([
      'org_2',
      'org_1',
    ])
  })

  test('draws nothing for an opted-in organization this person has left', () => {
    expect(postNotificationRows([], settings({ postOrganizationIds: ['org_1'] }))).toEqual([])
  })

  test('nothing beside the opt-in list can turn a switch on', () => {
    // The guarantee a Post has and a Broadcast does not: there is no essential
    // Post, no priority and no organization-level default that reaches past the
    // switch. Whatever else an organization or the settings document carries,
    // the only thing read is whether the id is in the list.
    const essential = {
      ...settings({ broadcastOptOut: false }),
      essential: true,
      postNotificationsDefault: true,
    } as NotificationSettings
    const rows = postNotificationRows(
      [{ ...ACME, essential: true, notifyByDefault: true } as Organization],
      essential,
    )
    expect(rows).toEqual([{ id: 'org_1', name: 'Acme', on: false }])
  })
})

describe('postNotificationCaveat', () => {
  test('says nothing when the phone can draw a notification', () => {
    expect(
      postNotificationCaveat({ status: 'granted', canAskAgain: false, askedBefore: true }),
    ).toBeNull()
  })

  test('tells somebody the app has not asked yet that notifications are not on yet', () => {
    // Never asked: on Android this reads `denied` and is not a refusal. Saying
    // they are turned *off* would be a claim about an answer nobody has given,
    // and the ask is still coming.
    const caveat = postNotificationCaveat({
      status: 'denied',
      canAskAgain: true,
      askedBefore: false,
    })
    expect(caveat).toMatch(/not on for Enki yet/i)
    expect(caveat).toMatch(/will not reach this phone/i)
    expect(caveat).toMatch(/still kept/i)
  })

  test('tells somebody who refused that notifications are off', () => {
    // The platform will not draw the dialog again, which is exactly when
    // `NotificationPermissionRow` offers the route into the platform's own
    // settings — so the sentence that reports a closed door has the way out
    // under it.
    const caveat = postNotificationCaveat({
      status: 'denied',
      canAskAgain: false,
      askedBefore: true,
    })
    expect(caveat).toMatch(/while notifications are off/i)
    expect(caveat).toMatch(/will not reach this phone/i)
    expect(caveat).toMatch(/still kept/i)
    // The row beneath says notifications are turned off, in those words. Saying
    // it again here printed one sentence twice on the emulator.
    expect(caveat).not.toMatch(/turned off/i)
  })

  test('says the same to somebody who dismissed the one dialog they will get', () => {
    expect(
      postNotificationCaveat({ status: 'undetermined', canAskAgain: true, askedBefore: true }),
    ).toMatch(/while notifications are off/i)
  })

  test('every standing but granted says both halves', () => {
    const standings: PermissionStanding[] = [
      { status: 'denied', canAskAgain: true, askedBefore: false },
      { status: 'denied', canAskAgain: false, askedBefore: true },
      { status: 'undetermined', canAskAgain: true, askedBefore: false },
      { status: 'undetermined', canAskAgain: true, askedBefore: true },
    ]
    for (const standing of standings) {
      const caveat = postNotificationCaveat(standing)
      expect(caveat).toMatch(/will not reach this phone/i)
      expect(caveat).toMatch(/still kept/i)
    }
  })
})
