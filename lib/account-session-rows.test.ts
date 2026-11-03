import { accountSessionRows, signOutOthersControl } from '@/lib/account-session-rows'
import type { AccountSession } from '@/lib/types'

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    id: 'sess_1',
    deviceName: 'Windows 11 - Chrome',
    deviceType: 'desktop',
    userAgent: null,
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

describe('accountSessionRows: this app names itself rather than being sniffed as a browser', () => {
  test('reads its own user agent as a phone running the app', () => {
    // What the API makes of the app's user agent: it finds Android and no
    // browser, and says so.
    const app = session({
      deviceName: 'Android - Unknown Browser',
      deviceType: 'mobile',
      userAgent: 'ChatRoute/1.0.23 (Android 14; Pixel 8)',
      loginMethod: 'google',
    })

    expect(accountSessionRows([app], null)[0]).toMatchObject({
      title: 'ChatRoute app - Android 14',
      detail: 'Phone · Pixel 8 · Signed in with Google',
    })
  })

  test('reads an iPad as a tablet', () => {
    const app = session({ userAgent: 'ChatRoute/1.0.23 (iPadOS 18.1; iPad)', loginMethod: null })

    expect(accountSessionRows([app], null)[0]).toMatchObject({
      title: 'ChatRoute app - iPadOS 18.1',
      detail: 'Tablet',
    })
  })

  test('calls a build from before that the app, and not a computer', () => {
    const legacy = session({
      deviceName: 'Unknown OS - Unknown Browser',
      deviceType: 'desktop',
      userAgent: 'okhttp/4.12.0',
      loginMethod: 'google',
    })

    expect(accountSessionRows([legacy], null)[0]).toMatchObject({
      title: 'ChatRoute app - Android',
      detail: 'Signed in with Google',
    })
  })

  test('names the device in the control that would end it', () => {
    const app = session({ userAgent: 'ChatRoute/1.0.23 (iOS 18.1; iPhone)' })

    expect(accountSessionRows([app], null)[0]?.action).toMatchObject({
      accessibilityLabel: 'End the session on ChatRoute app - iOS 18.1',
    })
  })

  test('leaves a browser as the API named it', () => {
    const browser = session({
      deviceName: 'Windows 10 - Chrome',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    })

    expect(accountSessionRows([browser], null)[0]).toMatchObject({
      title: 'Windows 10 - Chrome',
      detail: 'Computer · Signed in with a password',
    })
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
