import {
  PERMISSION_TRIGGERS,
  conversationIdFromPush,
  notificationIdFromPush,
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
