import {
  shouldAskForPermission,
  type PermissionAsk,
  type PermissionTrigger,
  type PushPermission,
} from '@/lib/push-rules'

function ask(overrides: Partial<PermissionAsk> = {}): PermissionAsk {
  return { status: 'undetermined', trigger: 'sign-in', askedBefore: false, ...overrides }
}

const TRIGGERS: PermissionTrigger[] = ['sign-in', 'message']
const SETTLED: PushPermission[] = ['granted', 'denied']

describe('a permission nobody has answered yet', () => {
  it.each(TRIGGERS)('is asked for on the %s trigger, on a device that has never asked', (trigger) => {
    expect(shouldAskForPermission(ask({ trigger }))).toBe(true)
  })

  /**
   * The row that separates *never reached* from *said no*. A dialog somebody
   * dismissed leaves the status exactly where it was, so the status alone cannot
   * tell the two apart — and asking again is the thing both platforms refuse to
   * draw.
   */
  it.each(TRIGGERS)('is not asked for again on the %s trigger once this device has asked', (trigger) => {
    expect(shouldAskForPermission(ask({ trigger, askedBefore: true }))).toBe(false)
  })
})

describe('a permission already settled', () => {
  it.each(SETTLED)('asks nothing when it is already %s', (status) => {
    for (const trigger of TRIGGERS) {
      for (const askedBefore of [false, true]) {
        expect(shouldAskForPermission(ask({ status, trigger, askedBefore }))).toBe(false)
      }
    }
  })
})
