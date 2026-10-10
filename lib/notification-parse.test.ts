import {
  parseNotification,
  parseNotifications,
  parseNotificationSettings,
  parseUnreadCount,
} from '@/lib/notification-parse'

describe('parseNotification', () => {
  const wire = {
    id: 'ntf_1',
    kind: 'wall_post',
    title: 'New post in Ops',
    body: 'Dana Reed: Opening hours change on Monday.',
    conversationId: null,
    messageId: null,
    broadcastId: null,
    wallPostId: 'pst_1',
    actorId: 'usr_1',
    readAt: null,
    createdAt: '2026-09-12T02:00:00.000Z',
  }

  test('reads the row the API answers with', () => {
    expect(parseNotification(wire)).toEqual({
      id: 'ntf_1',
      kind: 'wall_post',
      title: 'New post in Ops',
      body: 'Dana Reed: Opening hours change on Monday.',
      conversationId: null,
      broadcastId: null,
      wallPostId: 'pst_1',
      readAt: null,
      createdAt: '2026-09-12T02:00:00.000Z',
    })
  })

  test('drops a row it cannot key, route or date', () => {
    expect(parseNotification({ ...wire, id: '' })).toBeNull()
    expect(parseNotification({ ...wire, kind: undefined })).toBeNull()
    expect(parseNotification({ ...wire, createdAt: 'yesterday' })).toBeNull()
    expect(parseNotification('row')).toBeNull()
  })

  test('a missing title or reference is quiet rather than fatal', () => {
    const parsed = parseNotification({ ...wire, title: 7, wallPostId: '' })
    expect(parsed?.title).toBe('')
    expect(parsed?.wallPostId).toBeNull()
  })

  test('a page drops the rows it cannot read and refuses a body that is not a list', () => {
    expect(parseNotifications([wire, { id: 'bad' }])?.map((n) => n.id)).toEqual(['ntf_1'])
    expect(parseNotifications({ data: [] })).toBeNull()
  })
})

describe('parseUnreadCount', () => {
  test('reads a whole, non-negative count and nothing else', () => {
    expect(parseUnreadCount({ count: 3 })).toBe(3)
    expect(parseUnreadCount({ count: 0 })).toBe(0)
    expect(parseUnreadCount({ count: -1 })).toBeNull()
    expect(parseUnreadCount({ count: 1.5 })).toBeNull()
    expect(parseUnreadCount({})).toBeNull()
  })
})

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
