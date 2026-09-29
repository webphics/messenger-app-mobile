import { accountSessionRows, signOutOthersControl } from '@/lib/account-session-rows'
import type { AccountSession } from '@/lib/types'

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    id: 'sess_1',
    deviceName: 'Windows 11 - Chrome',
    deviceType: 'desktop',
    ipAddress: '203.0.113.4',
    loginMethod: 'email',
    isCurrent: false,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-20T18:30:00.000Z',
    ...overrides,
  }
}

const THIS_PHONE = session({
  id: 'sess_phone',
  deviceName: 'Android - Chrome',
  deviceType: 'mobile',
  loginMethod: 'google',
  isCurrent: true,
})

describe('accountSessionRows: the device in hand carries no revoke', () => {
  test('offers nothing at all on that row', () => {
    const rows = accountSessionRows([THIS_PHONE], 'sess_phone')

    expect(rows[0]?.action).toEqual({ kind: 'none' })
  })

  test('a list with no current row in it revokes every one of them', () => {
    const rows = accountSessionRows([session(), session({ id: 'sess_2' })], null)

    expect(rows.every((row) => row.action.kind === 'revoke')).toBe(true)
  })
})

describe('signOutOthersControl', () => {
  test('is offered when there is more than one session', () => {
    const rows = accountSessionRows([THIS_PHONE, session({ id: 'sess_2' })], 'sess_phone')

    expect(signOutOthersControl(rows)).toEqual({
      label: 'Sign out everywhere else',
      accessibilityLabel: 'Sign out of every session except this device',
    })
  })

  test('is never offered when the only session is this device', () => {
    const rows = accountSessionRows([THIS_PHONE], 'sess_phone')

    expect(signOutOthersControl(rows)).toBeNull()
  })
})
