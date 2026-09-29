import { parseAccountSession, parseAccountSessions } from '@/lib/account-session-parse'

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
  test('drops a row with no id, which is what a revoke is addressed to', () => {
    expect(parseAccountSession({ ...ROW, id: undefined })).toBeNull()
    expect(parseAccountSession({ ...ROW, id: '' })).toBeNull()
    expect(parseAccountSession({ ...ROW, id: 42 })).toBeNull()
  })

  test('takes only a true as this device, never a truthy value', () => {
    expect(parseAccountSession({ ...ROW, isCurrent: true })?.isCurrent).toBe(true)
    expect(parseAccountSession({ ...ROW, isCurrent: 'yes' })?.isCurrent).toBe(false)
    expect(parseAccountSession({ ...ROW, isCurrent: 1 })?.isCurrent).toBe(false)
    expect(parseAccountSession({ ...ROW, isCurrent: undefined })?.isCurrent).toBe(false)
  })
})

describe('parseAccountSessions', () => {
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
})
