import { parseNotificationSettings } from '@/lib/notification-parse'

describe('parseNotificationSettings', () => {
  test('reads the document the API answers with', () => {
    expect(
      parseNotificationSettings({
        broadcastOptOut: true,
        mutedConversationIds: ['cnv_1'],
        postOrganizationIds: ['org_1', 'org_2'],
      }),
    ).toEqual({
      broadcastOptOut: true,
      mutedConversationIds: ['cnv_1'],
      postOrganizationIds: ['org_1', 'org_2'],
    })
  })

  test('is not a document at all when the body is not a record', () => {
    for (const value of [null, undefined, 'settings', 42, []]) {
      expect(parseNotificationSettings(value)).toBeNull()
    }
  })

  test('drops the entries of a list that are not usable ids', () => {
    expect(
      parseNotificationSettings({ postOrganizationIds: ['org_1', '', 7, null, { id: 'org_2' }] })
        ?.postOrganizationIds,
    ).toEqual(['org_1'])
  })

  test('no field this build does not know can opt somebody in', () => {
    // The same guarantee `postNotificationRows` holds, at the other end: a
    // document that grows a default, a priority or an essential flag still opts
    // nobody into anything. Only the list does that.
    expect(
      parseNotificationSettings({
        postOrganizationIds: [],
        postNotificationsDefault: true,
        essentialOrganizationIds: ['org_1'],
      })?.postOrganizationIds,
    ).toEqual([])
  })
})
