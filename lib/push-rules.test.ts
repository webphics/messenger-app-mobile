import {
  PERMISSION_TRIGGERS,
  conversationIdFromPush,
  notificationIdFromPush,
  notificationIdsForConversation,
  shouldAskForPermission,
  shouldAskOnMessage,
  shouldOfferSystemSettings,
  type PushPermission,
} from '@/lib/push-rules'
import type { CustomerMessage, StaffMessage } from '@/lib/types'

/** The module's own list, so a third trigger reaches every row below. */
const TRIGGERS = PERMISSION_TRIGGERS

describe('an arriving message', () => {
  const SHARED = {
    id: 'msg_01',
    body: 'Are you still there?',
    messageType: 'text',
    createdAt: '2026-08-13T08:00:00.000Z',
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
  } satisfies Omit<CustomerMessage, 'fromCompany'>

  function toCustomer(overrides: Partial<CustomerMessage> = {}): CustomerMessage {
    return { ...SHARED, fromCompany: true, ...overrides }
  }

  function toStaff(senderId: string, overrides: Partial<StaffMessage> = {}): StaffMessage {
    return {
      ...SHARED,
      sender: { id: senderId, name: 'Jonah Reed', role: 'agent' },
      ...overrides,
    }
  }

  it('asks when somebody else wrote it', () => {
    expect(shouldAskOnMessage(toCustomer(), 'cust-1')).toBe(true)
  })

  it('does not ask on the viewer’s own message', () => {
    expect(shouldAskOnMessage(toStaff('agent-1'), 'agent-1')).toBe(false)
  })

  it('does not ask on a System notice', () => {
    expect(
      shouldAskOnMessage(toStaff('agent-2', { messageType: 'system' }), 'agent-1'),
    ).toBe(false)
  })
})

/**
 * Every distinct outcome of the permission table: which standings ask, and which
 * send somebody to system settings. Both are one decision seen from either side.
 */
describe('every standing the permission can be in', () => {
  type Row = {
    status: PushPermission
    canAskAgain: boolean
    askedBefore: boolean
    asks: boolean
    offersSettings: boolean
  }

  const TABLE: Row[] = [
    // Never asked, and the platform would draw the dialog.
    { status: 'undetermined', canAskAgain: true, askedBefore: false, asks: true, offersSettings: false },
    // Android 13+ reports never-asked as `denied`; `canAskAgain` is what tells them apart.
    { status: 'denied', canAskAgain: true, askedBefore: false, asks: true, offersSettings: false },
    // The dialog was drawn and dismissed: must not be asked again, settings is what is left.
    { status: 'undetermined', canAskAgain: true, askedBefore: true, asks: false, offersSettings: true },
    // The platform has closed the question.
    { status: 'denied', canAskAgain: false, askedBefore: false, asks: false, offersSettings: true },
    // Granted: nothing to ask, nothing to send anybody to settings about.
    { status: 'granted', canAskAgain: true, askedBefore: false, asks: false, offersSettings: false },
  ]

  it.each(TABLE)(
    '$status, canAskAgain $canAskAgain, askedBefore $askedBefore: asks $asks, offers settings $offersSettings',
    ({ asks, offersSettings, ...standing }) => {
      for (const trigger of TRIGGERS) {
        expect(shouldAskForPermission({ ...standing, trigger })).toBe(asks)
      }
      expect(shouldOfferSystemSettings(standing)).toBe(offersSettings)
    },
  )
})

describe('the conversation a tapped notification names', () => {
  function response(data: unknown) {
    return {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: { request: { content: { data } } },
    }
  }

  const PAYLOAD = {
    notificationPublicId: 'ntf_01',
    kind: 'message.created',
    conversationPublicId: 'cnv_01',
    preview: 'Are you still there?',
  }

  it('answers the conversation the dispatch named', () => {
    expect(conversationIdFromPush(response(PAYLOAD))).toBe('cnv_01')
  })

  it('answers null for a dispatch about no conversation', () => {
    expect(conversationIdFromPush(response({ ...PAYLOAD, conversationPublicId: null }))).toBeNull()
  })

  it.each([
    ['null', null],
    ['an id that is not a string', { conversationPublicId: 7 }],
    ['a payload naming everything but the conversation', { kind: 'message.created' }],
  ])('answers null for %s', (_case, data) => {
    expect(conversationIdFromPush(response(data))).toBeNull()
  })

  it.each([
    ['nothing', undefined],
    ['a response with no notification on it', {}],
    ['a content that is not a record', { notification: { request: { content: 'hi' } } }],
  ])('answers null rather than throwing for %s', (_case, tapped) => {
    expect(conversationIdFromPush(tapped)).toBeNull()
  })
})

describe('the notification a tap names', () => {
  function response(request: unknown) {
    return { notification: { request } }
  }

  it('answers the identifier the platform gave it', () => {
    expect(notificationIdFromPush(response({ identifier: 'ntf_01' }))).toBe('ntf_01')
  })

  it.each([
    ['an identifier that is empty', { identifier: '' }],
    ['no request at all', undefined],
  ])('answers null for %s', (_case, request) => {
    expect(notificationIdFromPush(response(request))).toBeNull()
  })
})

describe('the notifications standing in the shade for one conversation', () => {
  function presented(identifier: unknown, conversationPublicId: unknown) {
    return { request: { identifier, content: { data: { conversationPublicId } } } }
  }

  it('names only the notifications for the conversation that was read', () => {
    expect(
      notificationIdsForConversation(
        [presented('a', 'cnv_01'), presented('b', 'cnv_02'), presented('c', 'cnv_01')],
        'cnv_01',
      ),
    ).toEqual(['a', 'c'])
  })

  // An unreadable dispatch is never a wildcard: clearing too many hides a conversation.
  it.each([
    ['a notification that is not a record', 'a'],
    ['a dispatch about no conversation', presented('a', null)],
    ['an identifier that is empty', presented('', 'cnv_01')],
  ])('matches nothing on %s', (_case, notification) => {
    expect(notificationIdsForConversation([notification], 'cnv_01')).toEqual([])
  })

  // The Android case: FCM drew the notification itself, so only the tag says which thread.
  describe('a notification the platform drew itself', () => {
    function foreign(tag: string) {
      return {
        request: {
          identifier: `expo-notifications://foreign_notifications?tag=${encodeURIComponent(tag)}&id=0`,
          content: { data: { 'android.title': 'Admin', 'android.text': 'Hello' } },
        },
      }
    }

    it('is named by the conversation its tag begins with', () => {
      expect(notificationIdsForConversation([foreign('cnv_01:ntf_01')], 'cnv_01')).toEqual([
        'expo-notifications://foreign_notifications?tag=cnv_01%3Antf_01&id=0',
      ])
    })

    it.each([
      ['the tag Firebase invents for itself', 'FCM-Notification:8637759'],
      ['a tag naming a conversation and nothing else', 'cnv_01'],
    ])('matches nothing on %s', (_case, tag) => {
      expect(notificationIdsForConversation([foreign(tag)], 'cnv_01')).toEqual([])
    })

    it('answers nothing rather than throwing for an identifier that is not valid percent-encoding', () => {
      expect(
        notificationIdsForConversation([{ request: { identifier: '?tag=cnv%2' } }], 'cnv_01'),
      ).toEqual([])
    })

    it('prefers the payload to the tag when the dispatch is still readable', () => {
      const both = {
        request: {
          identifier: 'expo-notifications://foreign_notifications?tag=cnv_02%3Antf_01&id=0',
          content: { data: { conversationPublicId: 'cnv_01' } },
        },
      }

      expect(notificationIdsForConversation([both], 'cnv_01')).toHaveLength(1)
      expect(notificationIdsForConversation([both], 'cnv_02')).toEqual([])
    })
  })

  it.each([
    ['nothing', undefined],
    ['a record where the list should be', { 0: presented('a', 'cnv_01') }],
  ])('answers nothing rather than throwing for %s', (_case, shade) => {
    expect(notificationIdsForConversation(shade, 'cnv_01')).toEqual([])
  })
})
