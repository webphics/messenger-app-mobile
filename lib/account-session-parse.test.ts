import {
  parseAccountSession,
  parseAccountSessionAcknowledgement,
  parseAccountSessions,
} from '@/lib/account-session-parse'

const ROW = {
  id: 'b1d5f6a0-0000-4000-8000-000000000001',
  deviceName: 'Windows 11 - Chrome',
  deviceType: 'desktop',
  ipAddress: '203.0.113.4',
  userAgent: 'Mozilla/5.0 (Windows NT 11.0) Chrome/140',
  loginMethod: 'email',
  status: 'active',
  isCurrent: false,
  isRevoked: false,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-20T18:30:00.000Z',
  expiresAt: '2026-10-01T09:00:00.000Z',
}

function page(rows: unknown[], extra: Record<string, unknown> = {}) {
  return { rows, total: rows.length, page: 1, pageSize: 50, activeOtherSessionCount: 0, ...extra }
}

describe('parseAccountSession', () => {
  test('keeps what the screen reads and drops what it does not', () => {
    expect(parseAccountSession(ROW)).toEqual({
      id: 'b1d5f6a0-0000-4000-8000-000000000001',
      deviceName: 'Windows 11 - Chrome',
      deviceType: 'desktop',
      ipAddress: '203.0.113.4',
      loginMethod: 'email',
      isCurrent: false,
      createdAt: '2026-09-01T09:00:00.000Z',
      updatedAt: '2026-09-20T18:30:00.000Z',
    })
  })

  test('drops a row with no id, which is what a revoke is addressed to', () => {
    expect(parseAccountSession({ ...ROW, id: undefined })).toBeNull()
    expect(parseAccountSession({ ...ROW, id: '' })).toBeNull()
    expect(parseAccountSession({ ...ROW, id: 42 })).toBeNull()
  })

  test('falls back on everything else rather than losing the device', () => {
    expect(
      parseAccountSession({ id: 'sess_1' }),
    ).toEqual({
      id: 'sess_1',
      deviceName: '',
      deviceType: '',
      ipAddress: null,
      loginMethod: null,
      isCurrent: false,
      createdAt: '',
      updatedAt: '',
    })
  })

  test('takes only a true as this device, never a truthy value', () => {
    expect(parseAccountSession({ ...ROW, isCurrent: true })?.isCurrent).toBe(true)
    expect(parseAccountSession({ ...ROW, isCurrent: 'yes' })?.isCurrent).toBe(false)
    expect(parseAccountSession({ ...ROW, isCurrent: 1 })?.isCurrent).toBe(false)
    expect(parseAccountSession({ ...ROW, isCurrent: undefined })?.isCurrent).toBe(false)
  })

  test('is not a row at all when it is not an object', () => {
    expect(parseAccountSession(null)).toBeNull()
    expect(parseAccountSession('sess_1')).toBeNull()
    expect(parseAccountSession([ROW])).toBeNull()
  })
})

describe('parseAccountSessions', () => {
  test('reads the rows out of the page', () => {
    const sessions = parseAccountSessions(page([ROW, { ...ROW, id: 'sess_2', isCurrent: true }]))

    expect(sessions?.map((session) => session.id)).toEqual([
      'b1d5f6a0-0000-4000-8000-000000000001',
      'sess_2',
    ])
  })

  test('keeps the readable rows of a page that also held an unreadable one', () => {
    const sessions = parseAccountSessions(page([ROW, { deviceName: 'Nameless' }]))

    expect(sessions).toHaveLength(1)
  })

  test('answers malformed for a page it could read none of', () => {
    // Rather than an empty list. The caller of this request is signed in, so
    // their own session is in every page of active ones: nothing readable
    // means a shape this build cannot read, and an empty list would tell
    // somebody they are signed in nowhere.
    expect(parseAccountSessions(page([{ deviceName: 'Nameless' }]))).toBeNull()
  })

  test('answers an honestly empty page as an empty list', () => {
    expect(parseAccountSessions(page([]))).toEqual([])
  })

  test('answers malformed for a body that is not a page', () => {
    expect(parseAccountSessions(null)).toBeNull()
    expect(parseAccountSessions([ROW])).toBeNull()
    expect(parseAccountSessions({ total: 1 })).toBeNull()
    expect(parseAccountSessions({ rows: 'one' })).toBeNull()
  })

  test('ignores everything in the page but the rows', () => {
    expect(parseAccountSessions(page([ROW], { activeOtherSessionCount: 'lots' }))).toHaveLength(1)
  })
})

describe('parseAccountSessionAcknowledgement', () => {
  test('takes both revoke bodies as acknowledged', () => {
    expect(parseAccountSessionAcknowledgement({ revoked: true })).toBe(true)
    expect(parseAccountSessionAcknowledgement({ revokedCount: 3 })).toBe(true)
  })

  test('checks the envelope rather than the number, which nothing reads back', () => {
    expect(parseAccountSessionAcknowledgement({ revokedCount: 0 })).toBe(true)
    expect(parseAccountSessionAcknowledgement({})).toBe(true)
  })

  test('answers malformed for a body that is not one', () => {
    expect(parseAccountSessionAcknowledgement(null)).toBeNull()
    expect(parseAccountSessionAcknowledgement('revoked')).toBeNull()
    expect(parseAccountSessionAcknowledgement([])).toBeNull()
  })
})
