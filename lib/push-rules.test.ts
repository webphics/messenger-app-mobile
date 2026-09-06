import {
  PERMISSION_TRIGGERS,
  conversationIdFromPush,
  notificationIdFromPush,
  notificationIdsForConversation,
  shouldAskForPermission,
  shouldAskOnMessage,
  shouldOfferSystemSettings,
  type PermissionAsk,
  type PushPermission,
} from '@/lib/push-rules'
import type { CustomerMessage, StaffMessage } from '@/lib/types'

function ask(overrides: Partial<PermissionAsk> = {}): PermissionAsk {
  return {
    status: 'undetermined',
    canAskAgain: true,
    trigger: 'sign-in',
    askedBefore: false,
    ...overrides,
  }
}

/** The module's own list, so a third trigger reaches every row below. */
const TRIGGERS = PERMISSION_TRIGGERS

describe('a device that has never asked', () => {
  it.each(TRIGGERS)('asks on the %s trigger', (trigger) => {
    expect(shouldAskForPermission(ask({ trigger }))).toBe(true)
  })

  /**
   * The row hand-verification added. `expo-notifications` maps Android 13+'s
   * never-asked state to `denied`, because it reads
   * `areNotificationsEnabled()` — false on a fresh install — before it reads the
   * runtime permission. Reading `denied` as *said no* is why the dialog never
   * appeared on the emulator: on Android it is what *not yet asked* looks like,
   * and `canAskAgain` is the field that tells the two apart.
   */
  it.each(TRIGGERS)('asks on the %s trigger when the platform calls that denied', (trigger) => {
    expect(shouldAskForPermission(ask({ trigger, status: 'denied' }))).toBe(true)
  })
})

describe('a device that has asked before', () => {
  /**
   * The whole point of keeping the flag: neither an Android dialog somebody
   * dismissed nor one they refused once moves the platform off `denied` with
   * `canAskAgain` still true, so the platform cannot say which happened. The
   * second trigger is for whoever the first never reached, never a second ask.
   */
  it.each(['undetermined', 'denied'] as const)('does not ask again on %s', (status) => {
    for (const trigger of TRIGGERS) {
      expect(shouldAskForPermission(ask({ status, trigger, askedBefore: true }))).toBe(false)
    }
  })
})

describe('a permission the platform will not put a dialog behind', () => {
  /** Refused twice on Android, or refused at all on iOS: a request draws nothing. */
  it.each([false, true])('asks nothing when it cannot ask again (asked before: %s)', (askedBefore) => {
    expect(
      shouldAskForPermission(ask({ status: 'denied', canAskAgain: false, askedBefore })),
    ).toBe(false)
  })
})

describe('a permission already granted', () => {
  it('has nothing left to ask for', () => {
    for (const trigger of TRIGGERS) {
      for (const askedBefore of [false, true]) {
        expect(
          shouldAskForPermission(ask({ status: 'granted', trigger, askedBefore })),
        ).toBe(false)
      }
    }
  })
})

/**
 * Which arriving Message is one of the moments that asks.
 *
 * A viewer of each kind, because who *sent* a message is read differently on
 * either side of the company: a Customer's Support DM carries `fromCompany` and
 * no sender at all, and Staff read a sender's id. Both are `isOutgoing`'s
 * problem and tested there; what is tested here is that this asks it, and that a
 * System notice is nobody's reply.
 */
describe('an arriving message', () => {
  const SHARED = {
    id: 'msg_01',
    body: 'Are you still there?',
    messageType: 'text',
    createdAt: '2026-08-13T08:00:00.000Z',
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
  } satisfies Omit<CustomerMessage, 'fromCompany'>

  /** What a Customer receives: the company speaks as one voice and names nobody. */
  function toCustomer(overrides: Partial<CustomerMessage> = {}): CustomerMessage {
    return { ...SHARED, fromCompany: true, ...overrides }
  }

  /** What Staff receive: a sender, which is who `isOutgoing` reads. */
  function toStaff(senderId: string, overrides: Partial<StaffMessage> = {}): StaffMessage {
    return {
      ...SHARED,
      sender: { id: senderId, name: 'Jonah Reed', role: 'agent' },
      ...overrides,
    }
  }

  it('asks when the company has answered a Customer', () => {
    expect(shouldAskOnMessage(toCustomer(), 'cust-1')).toBe(true)
  })

  it('asks a staff viewer when somebody else wrote it', () => {
    expect(shouldAskOnMessage(toStaff('agent-2'), 'agent-1')).toBe(true)
  })

  it('does not ask on the viewer’s own message', () => {
    expect(shouldAskOnMessage(toCustomer({ fromCompany: false }), 'cust-1')).toBe(false)
    expect(shouldAskOnMessage(toStaff('agent-1'), 'agent-1')).toBe(false)
  })

  /** Nobody is watching for the app to say somebody joined a thread. */
  it('does not ask on a System notice, whoever it reaches', () => {
    expect(
      shouldAskOnMessage(toCustomer({ messageType: 'system' }), 'cust-1'),
    ).toBe(false)
    expect(
      shouldAskOnMessage(toStaff('agent-2', { messageType: 'system' }), 'agent-1'),
    ).toBe(false)
  })
})

/**
 * The same table again, written out in full.
 *
 * The rows above say *why* each answer is what it is and are the ones worth
 * reading; this one says that nothing is missing — every combination of the
 * three fields the platform and the cache can be in, against both moments that
 * ask and against the route Settings offers when neither will.
 *
 * The two columns are here together because they are one decision seen from
 * both sides: a standing this app can still ask about is never one to send
 * somebody to system settings over, and the moment that stops being true is the
 * moment the row is worth showing. Written as literals rather than derived from
 * anything, so a change to either rule has to change a row here.
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
    // Nobody has asked yet, and the platform would draw the dialog. The one
    // standing that asks — and `denied` is the same standing on Android 13+.
    { status: 'undetermined', canAskAgain: true, askedBefore: false, asks: true, offersSettings: false },
    { status: 'denied', canAskAgain: true, askedBefore: false, asks: true, offersSettings: false },

    // The dialog has been drawn and answered with nothing. The platform would
    // draw it again and must not be asked to; system settings is what is left.
    { status: 'undetermined', canAskAgain: true, askedBefore: true, asks: false, offersSettings: true },
    { status: 'denied', canAskAgain: true, askedBefore: true, asks: false, offersSettings: true },

    // The platform has closed the question — refused twice on Android, once on
    // iOS, or turned off in settings. Whether this app ever asked is moot.
    { status: 'undetermined', canAskAgain: false, askedBefore: false, asks: false, offersSettings: true },
    { status: 'undetermined', canAskAgain: false, askedBefore: true, asks: false, offersSettings: true },
    { status: 'denied', canAskAgain: false, askedBefore: false, asks: false, offersSettings: true },
    { status: 'denied', canAskAgain: false, askedBefore: true, asks: false, offersSettings: true },

    // Granted. Nothing to ask for and nothing to send anybody to settings about.
    { status: 'granted', canAskAgain: true, askedBefore: false, asks: false, offersSettings: false },
    { status: 'granted', canAskAgain: true, askedBefore: true, asks: false, offersSettings: false },
    { status: 'granted', canAskAgain: false, askedBefore: false, asks: false, offersSettings: false },
    { status: 'granted', canAskAgain: false, askedBefore: true, asks: false, offersSettings: false },
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

  it('covers every combination there is', () => {
    const standings = TABLE.map(
      ({ status, canAskAgain, askedBefore }) => `${status}/${canAskAgain}/${askedBefore}`,
    )
    // Three statuses, two platform answers, two records of an ask, each once.
    expect(new Set(standings).size).toBe(3 * 2 * 2)
    expect(standings).toHaveLength(new Set(standings).size)
  })
})

/**
 * The second table: what a tapped notification means.
 *
 * Every row is a payload rather than a device, because that is what this is —
 * `realtime-events`' rule moved onto the other transport. A dispatch this build
 * cannot read answers null and the launch proceeds; nothing here throws, and a
 * malformed one must not be able to take a cold start with it.
 */
describe('the conversation a tapped notification names', () => {
  /** What the API actually dispatches. See `expo-push.service.ts`. */
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

  it('reads nothing else off the payload — the routing is the id alone', () => {
    expect(conversationIdFromPush(response({ conversationPublicId: 'cnv_02' }))).toBe('cnv_02')
  })

  /**
   * The API's own type says this is nullable: a kind that is not about a
   * conversation dispatches with none, and there is nowhere for that tap to go
   * but where the launch was going anyway.
   */
  it('answers null for a dispatch about no conversation', () => {
    expect(conversationIdFromPush(response({ ...PAYLOAD, conversationPublicId: null }))).toBeNull()
  })

  it.each([
    ['no payload at all', undefined],
    ['null', null],
    ['a string where the object should be', 'cnv_01'],
    ['an array, which is an object and is not a record', ['cnv_01']],
    ['an id that is not a string', { conversationPublicId: 7 }],
    ['an id that is empty', { conversationPublicId: '' }],
    ['a payload naming everything but the conversation', { kind: 'message.created' }],
  ])('answers null for %s', (_case, data) => {
    expect(conversationIdFromPush(response(data))).toBeNull()
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'tapped'],
    ['an array', []],
    ['a response with no notification on it', {}],
    ['a notification with no request on it', { notification: {} }],
    ['a request with no content on it', { notification: { request: {} } }],
    ['a content that is not a record', { notification: { request: { content: 'hi' } } }],
  ])('answers null rather than throwing for %s', (_case, tapped) => {
    expect(conversationIdFromPush(tapped)).toBeNull()
  })
})

/**
 * The other half of the payload table: which notification this is.
 *
 * Not about where a tap goes — `push-device` uses it to tell the second report
 * of one tap from a second tap — but read here so that the walk down to it is
 * the walk `conversationIdFromPush` is tested through.
 */
describe('the notification a tap names', () => {
  function response(request: unknown) {
    return { notification: { request } }
  }

  it('answers the identifier the platform gave it', () => {
    expect(notificationIdFromPush(response({ identifier: 'ntf_01' }))).toBe('ntf_01')
  })

  it.each([
    ['a request naming no identifier', {}],
    ['an identifier that is not a string', { identifier: 7 }],
    ['an identifier that is empty', { identifier: '' }],
    ['a request that is not a record', 'ntf_01'],
    ['no request at all', undefined],
  ])('answers null for %s', (_case, request) => {
    expect(notificationIdFromPush(response(request))).toBeNull()
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'tapped'],
    ['a response with no notification on it', {}],
  ])('answers null rather than throwing for %s', (_case, tapped) => {
    expect(notificationIdFromPush(tapped)).toBeNull()
  })
})

/**
 * The third thing read off a payload, and the only one that is not about a tap.
 *
 * Reading a thread has to take that thread's notifications out of the shade and
 * nobody else's: clearing too few leaves a second unread count disagreeing with
 * the badge, and clearing too many hides a conversation nobody has looked at.
 */
describe('the notifications standing in the shade for one conversation', () => {
  function presented(identifier: unknown, conversationPublicId: unknown) {
    return { request: { identifier, content: { data: { conversationPublicId } } } }
  }

  it('names every notification for the conversation that was read', () => {
    expect(
      notificationIdsForConversation(
        [presented('a', 'cnv_01'), presented('b', 'cnv_01')],
        'cnv_01',
      ),
    ).toEqual(['a', 'b'])
  })

  it('leaves another conversation’s where they are', () => {
    expect(
      notificationIdsForConversation(
        [presented('a', 'cnv_01'), presented('b', 'cnv_02'), presented('c', 'cnv_01')],
        'cnv_01',
      ),
    ).toEqual(['a', 'c'])
  })

  it('names nothing when the shade holds nothing for it', () => {
    expect(notificationIdsForConversation([presented('a', 'cnv_02')], 'cnv_01')).toEqual([])
  })

  /**
   * A dispatch this build cannot read is not a reason to clear one it can, so
   * every unreadable row is simply unmatched rather than treated as a wildcard.
   */
  it.each([
    ['a notification that is not a record', 'a'],
    ['a notification with no request on it', {}],
    ['a request that is not a record', { request: 7 }],
    ['a request with no content on it', { request: { identifier: 'a' } }],
    ['a dispatch about no conversation', presented('a', null)],
    ['a conversation id that is not a string', presented('a', 7)],
    ['an identifier the platform did not give', presented(undefined, 'cnv_01')],
    ['an identifier that is empty', presented('', 'cnv_01')],
  ])('matches nothing on %s', (_case, notification) => {
    expect(notificationIdsForConversation([notification], 'cnv_01')).toEqual([])
  })

  /**
   * The Android case, and on the one platform this ships to the only one: FCM
   * drew the notification itself, so nothing of the dispatch survives in it and
   * the tag the API set is what says which thread it belongs to.
   */
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

    /** The tag is per notification, so a thread's notifications do not collapse. */
    it('names every notification a thread has standing', () => {
      expect(
        notificationIdsForConversation(
          [foreign('cnv_01:ntf_01'), foreign('cnv_02:ntf_02'), foreign('cnv_01:ntf_03')],
          'cnv_01',
        ),
      ).toHaveLength(2)
    })

    it.each([
      ['the tag Firebase invents for itself', 'FCM-Notification:8637759'],
      ['a tag naming a conversation and nothing else', 'cnv_01'],
      ['a tag beginning with the separator', ':cnv_01'],
    ])('matches nothing on %s', (_case, tag) => {
      expect(notificationIdsForConversation([foreign(tag)], 'cnv_01')).toEqual([])
    })

    it.each([
      ['an identifier naming no tag', 'expo-notifications://foreign_notifications?id=0'],
      ['an identifier that is not a string', 7],
      ['an identifier that is not valid percent-encoding', '?tag=cnv%2'],
    ])('answers nothing rather than throwing for %s', (_case, identifier) => {
      expect(
        notificationIdsForConversation([{ request: { identifier } }], 'cnv_01'),
      ).toEqual([])
    })

    /** The payload is the truth wherever it survived, and it survives on iOS. */
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
    ['null', null],
    ['a record where the list should be', { 0: presented('a', 'cnv_01') }],
    ['a string', 'cnv_01'],
  ])('answers nothing rather than throwing for %s', (_case, shade) => {
    expect(notificationIdsForConversation(shade, 'cnv_01')).toEqual([])
  })

  /** Nothing is named by an empty id, which is what an unreadable route is. */
  it('clears nothing for a conversation with no id', () => {
    expect(notificationIdsForConversation([presented('a', '')], '')).toEqual([])
  })
})
