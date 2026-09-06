import {
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
