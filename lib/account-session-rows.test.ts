import {
  accountSessionRows,
  currentAccountSessionId,
  signOutOthersControl,
} from '@/lib/account-session-rows'
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

describe('currentAccountSessionId', () => {
  test('reads the device in hand off the list, so no screen has to', () => {
    expect(currentAccountSessionId([session(), THIS_PHONE])).toBe('sess_phone')
  })

  test('answers null when the API marked none of them', () => {
    expect(currentAccountSessionId([session(), session({ id: 'sess_2' })])).toBeNull()
  })

  test('answers null for a list with nothing in it', () => {
    expect(currentAccountSessionId([])).toBeNull()
  })
})

describe('accountSessionRows: which row is the device in hand', () => {
  test('marks the row the passed id names', () => {
    const rows = accountSessionRows([session(), THIS_PHONE], 'sess_phone')

    expect(rows.map((row) => row.thisDevice)).toEqual([false, true])
  })

  test('marks nothing when there is no current id', () => {
    const rows = accountSessionRows([session(), THIS_PHONE], null)

    expect(rows.every((row) => !row.thisDevice)).toBe(true)
  })

  test('follows the id it was given rather than the flag on the row', () => {
    // The two are the same in every answer the API gives, and the point of
    // passing the id in is that the rule has one input. A row that disagrees
    // with it is not marked.
    const rows = accountSessionRows([THIS_PHONE], 'sess_other')

    expect(rows[0]?.thisDevice).toBe(false)
  })

  test('keeps the order the API answered in', () => {
    const rows = accountSessionRows(
      [THIS_PHONE, session({ id: 'sess_2' }), session({ id: 'sess_3' })],
      'sess_phone',
    )

    expect(rows.map((row) => row.id)).toEqual(['sess_phone', 'sess_2', 'sess_3'])
  })
})

describe('accountSessionRows: the device in hand carries no revoke', () => {
  test('offers nothing at all on that row', () => {
    const rows = accountSessionRows([THIS_PHONE], 'sess_phone')

    expect(rows[0]?.action).toEqual({ kind: 'none' })
  })

  test('offers a revoke on every other row', () => {
    const rows = accountSessionRows([THIS_PHONE, session({ id: 'sess_2' })], 'sess_phone')

    expect(rows[1]?.action).toEqual({
      kind: 'revoke',
      label: 'End session',
      accessibilityLabel: 'End the session on Windows 11 - Chrome',
    })
  })

  test('the revoke names the device it would end', () => {
    const rows = accountSessionRows(
      [THIS_PHONE, session({ id: 'sess_2', deviceName: 'macOS - Safari' })],
      'sess_phone',
    )

    expect(rows[1]?.action).toMatchObject({
      accessibilityLabel: 'End the session on macOS - Safari',
    })
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

  test('is not offered for a lone other session, which carries its own revoke', () => {
    const rows = accountSessionRows([session()], 'sess_phone')

    expect(rows[0]?.action.kind).toBe('revoke')
    expect(signOutOthersControl(rows)).toBeNull()
  })

  test('is not offered over nothing', () => {
    expect(signOutOthersControl([])).toBeNull()
  })

  test('is offered on the count alone, whatever the rows are', () => {
    const rows = accountSessionRows([session(), session({ id: 'sess_2' })], null)

    expect(signOutOthersControl(rows)).not.toBeNull()
  })
})

describe('accountSessionRows: what a row says about its device', () => {
  test('names the device and says what kind it is and how it signed in', () => {
    const rows = accountSessionRows([session()], null)

    expect(rows[0]).toMatchObject({
      title: 'Windows 11 - Chrome',
      detail: 'Computer · Signed in with a password',
    })
  })

  test('calls a magic link and Google what this product calls them', () => {
    const magic = accountSessionRows([session({ loginMethod: 'magic-link' })], null)
    const google = accountSessionRows([session({ loginMethod: 'google' })], null)

    expect(magic[0]?.detail).toBe('Computer · Signed in with a magic link')
    expect(google[0]?.detail).toBe('Computer · Signed in with Google')
  })

  test('prints a method this build has never heard of rather than dropping it', () => {
    const rows = accountSessionRows([session({ loginMethod: 'passkey' })], null)

    expect(rows[0]?.detail).toBe('Computer · Signed in with passkey')
  })

  test('says nothing about a device type the API could not work out', () => {
    const rows = accountSessionRows([session({ deviceType: 'unknown' })], null)

    expect(rows[0]?.detail).toBe('Signed in with a password')
  })

  test('says nothing at all rather than half a sentence', () => {
    const rows = accountSessionRows([session({ deviceType: 'unknown', loginMethod: null })], null)

    expect(rows[0]?.detail).toBe('')
  })

  test('turns the API’s bare “Unknown” into a phrase that reads as one', () => {
    const rows = accountSessionRows([session({ deviceName: 'Unknown' })], null)

    expect(rows[0]?.title).toBe('Unknown device')
  })

  test('never draws an empty title', () => {
    const rows = accountSessionRows([session({ deviceName: '   ' })], null)

    expect(rows[0]?.title).toBe('Unknown device')
  })

  test('carries the time as it arrived, for the screen to present', () => {
    const rows = accountSessionRows([session()], null)

    expect(rows[0]?.lastActiveAt).toBe('2026-09-20T18:30:00.000Z')
  })

  test('falls back to when the session began where nothing has touched it since', () => {
    const rows = accountSessionRows([session({ updatedAt: '' })], null)

    expect(rows[0]?.lastActiveAt).toBe('2026-09-01T09:00:00.000Z')
  })

  test('draws nothing at all for a list with nothing in it', () => {
    expect(accountSessionRows([], null)).toEqual([])
  })
})
