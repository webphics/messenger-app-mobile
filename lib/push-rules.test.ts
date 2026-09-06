import {
  conversationIdFromPush,
  notificationIdFromPush,
  shouldAskForPermission,
  type PermissionAsk,
  type PermissionTrigger,
} from '@/lib/push-rules'

function ask(overrides: Partial<PermissionAsk> = {}): PermissionAsk {
  return {
    status: 'undetermined',
    canAskAgain: true,
    trigger: 'sign-in',
    askedBefore: false,
    ...overrides,
  }
}

const TRIGGERS: PermissionTrigger[] = ['sign-in', 'message']

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
