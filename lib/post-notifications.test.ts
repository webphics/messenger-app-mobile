import { postNotificationRows } from '@/lib/post-notifications'
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

test('turns on exactly the organizations named in the opt-in list, and none before settings arrive', () => {
  expect(
    postNotificationRows([ACME, BOREALIS], settings({ postOrganizationIds: ['org_2'] })),
  ).toEqual([
    { id: 'org_1', name: 'Acme', on: false },
    { id: 'org_2', name: 'Borealis', on: true },
  ])
  expect(postNotificationRows([ACME], null)).toEqual([{ id: 'org_1', name: 'Acme', on: false }])
})

// No essential Post, no priority and no organization-level default reaches past the switch.
test('nothing beside the opt-in list can turn a switch on', () => {
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
